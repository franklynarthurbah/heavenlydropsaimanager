/**
 * AI Detector Service
 *
 * Classifies whether an email was written by a human or generated
 * by an AI system (GPT, Claude, Gemini, etc.).
 *
 * Approach:
 *  1. Fast heuristic scoring (burstiness, vocabulary, patterns)
 *  2. OpenAI-based deep classification for borderline cases
 *
 * Results are persisted to email_ai_detection and mirrored on
 * the email_logs row for quick filtering in the dashboard.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AiService } from '../ai/ai.service';

export interface DetectionResult {
  isAiGenerated: boolean;
  confidence: number;  // 0–1
  signals: {
    punctuationScore: number;
    sentenceLengthVariance: number;
    vocabularyRichnessScore: number;
    boilerplateMatches: number;
    aiSignatureCount: number;
  };
  modelVersion: string;
}

@Injectable()
export class AiDetectorService {
  private readonly logger = new Logger(AiDetectorService.name);
  private readonly MODEL_VERSION = '1.2.0';

  // Phrases that commonly appear in AI-generated text
  private readonly AI_PHRASES = [
    'certainly!', 'absolutely!', 'of course!', 'i hope this finds you well',
    'i hope this email finds you', 'feel free to reach out', 'do not hesitate to contact',
    'please let me know if', 'as an ai', 'as a language model', 'i cannot provide',
    'in conclusion,', 'in summary,', 'furthermore,', 'moreover,', 'it is worth noting',
    'it is important to note', 'it is crucial to', 'firstly,', 'secondly,', 'lastly,',
    'to summarize,', 'to conclude,', 'rest assured', 'best regards,\n', 'warm regards,\n',
    'i would be happy to', 'i would be glad to', 'i am writing to',
  ];

  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private aiService: AiService,
  ) {}

  /**
   * Analyze an email body and return AI vs Human classification.
   */
  async detect(
    emailLogId: string,
    subject: string,
    bodyText: string,
  ): Promise<DetectionResult> {
    const combined = `${subject}\n\n${bodyText}`;

    // ── Step 1: Heuristics ────────────────────────────────
    const heuristics = this.runHeuristics(combined);
    let confidence = heuristics.score;
    let isAiGenerated = confidence >= 0.65;

    // ── Step 2: Deep AI check for borderline cases ─────────
    if (confidence >= 0.45 && confidence <= 0.75) {
      try {
        const deepResult = await this.deepClassify(combined);
        // Blend heuristic and deep scores
        confidence = (confidence * 0.4) + (deepResult * 0.6);
        isAiGenerated = confidence >= 0.60;
      } catch (err) {
        this.logger.warn('Deep AI classification failed, using heuristics only:', err.message);
      }
    }

    const result: DetectionResult = {
      isAiGenerated,
      confidence: Math.round(confidence * 1000) / 1000,
      signals: heuristics.signals,
      modelVersion: this.MODEL_VERSION,
    };

    // ── Persist ─────────────────────────────────────────────
    await this.persist(emailLogId, result);

    return result;
  }

  // ── Heuristics ──────────────────────────────────────────────────────────────

  private runHeuristics(text: string): { score: number; signals: DetectionResult['signals'] } {
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];

    // 1. Punctuation density (AI tends to be consistent)
    const totalChars = text.length;
    const punctuationCount = (text.match(/[,;:—–]/g) ?? []).length;
    const punctuationScore = Math.min(1, punctuationCount / (totalChars / 80));

    // 2. Sentence length variance (low variance → AI)
    const lengths = sentences.map(s => s.trim().length);
    const mean = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
    const variance = lengths.reduce((acc, l) => acc + Math.pow(l - mean, 2), 0) / (lengths.length || 1);
    const stddev = Math.sqrt(variance);
    // Humans typically have stddev > 20; AI tends to be 10–15
    const sentenceLengthVariance = Math.max(0, Math.min(1, 1 - (stddev / 40)));

    // 3. Vocabulary richness (type-token ratio; AI is high and stable)
    const words = text.toLowerCase().match(/\b\w+\b/g) ?? [];
    const uniqueWords = new Set(words).size;
    const ttr = words.length > 0 ? uniqueWords / words.length : 0;
    // AI: ~0.6–0.75. Humans: more variable (0.4–0.9)
    const vocabularyRichnessScore = ttr >= 0.55 && ttr <= 0.80 ? 0.7 : 0.2;

    // 4. Boilerplate/template phrases
    const textLower = text.toLowerCase();
    const boilerplateMatches = this.AI_PHRASES.filter(p => textLower.includes(p)).length;
    const boilerplateScore = Math.min(1, boilerplateMatches / 3);

    // 5. AI signature count
    const aiSignatureCount = (text.match(/\bas an ai\b|\bas a language model\b|\bi cannot\b/gi) ?? []).length;
    const aiSignatureScore = Math.min(1, aiSignatureCount);

    // ── Weighted composite ───────────────────────────────────
    const score =
      punctuationScore * 0.15 +
      sentenceLengthVariance * 0.25 +
      vocabularyRichnessScore * 0.20 +
      boilerplateScore * 0.30 +
      aiSignatureScore * 0.10;

    return {
      score,
      signals: {
        punctuationScore: Math.round(punctuationScore * 1000) / 1000,
        sentenceLengthVariance: Math.round(sentenceLengthVariance * 1000) / 1000,
        vocabularyRichnessScore: Math.round(vocabularyRichnessScore * 1000) / 1000,
        boilerplateMatches,
        aiSignatureCount,
      },
    };
  }

  // ── Deep OpenAI classification ────────────────────────────────────────────

  private async deepClassify(text: string): Promise<number> {
    const prompt = `You are a text-origin classifier. Analyze the following email excerpt and return ONLY a JSON object with a single key "ai_probability" (float 0.0–1.0) indicating how likely the text was generated by an AI system.

Email text (first 800 characters):
"""
${text.slice(0, 800)}
"""

Respond ONLY with: {"ai_probability": 0.XX}`;

    const result = await this.aiService.extractQualificationData(prompt) as any;
    return parseFloat(result?.ai_probability ?? '0.5') || 0.5;
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private async persist(emailLogId: string, result: DetectionResult): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO email_ai_detection
           (email_log_id, is_ai_generated, confidence, signals, model_version)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email_log_id) DO UPDATE SET
           is_ai_generated = EXCLUDED.is_ai_generated,
           confidence = EXCLUDED.confidence,
           signals = EXCLUDED.signals,
           detected_at = now()`,
        [
          emailLogId,
          result.isAiGenerated,
          result.confidence,
          JSON.stringify(result.signals),
          result.modelVersion,
        ],
      );

      // Mirror on email_logs for fast dashboard queries
      await this.dataSource.query(
        `UPDATE email_logs
         SET is_ai_generated = $1, ai_detection_confidence = $2
         WHERE id = $3`,
        [result.isAiGenerated, result.confidence, emailLogId],
      );
    } catch (err) {
      this.logger.error('Failed to persist AI detection result:', err.message);
    }
  }

  // ── Batch re-classify ─────────────────────────────────────────────────────

  async batchDetect(limit = 50): Promise<{ processed: number; ai: number; human: number }> {
    const rows = await this.dataSource.query<
      { id: string; subject: string; body_text: string }[]
    >(
      `SELECT id, subject, body_text FROM email_logs
       WHERE is_ai_generated IS NULL
         AND direction = 'inbound'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );

    let ai = 0;
    let human = 0;

    for (const row of rows) {
      const r = await this.detect(row.id, row.subject ?? '', row.body_text ?? '');
      r.isAiGenerated ? ai++ : human++;
    }

    return { processed: rows.length, ai, human };
  }
}
