/**
 * Knowledge Service
 * 
 * Manages knowledge documents parsed from external websites.
 * Periodically syncs content from:
 * - Study in Spain page
 * - Work in Czech Republic page
 * - About Us page
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { KnowledgeDocument, DocumentType, DocumentStatus } from './entities/knowledge-document.entity';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  // Source URLs to sync
  private readonly sources = {
    study_in_spain: 'https://www.workandstudyabroad.com.tr/study-in-spain/',
    work_in_czech: 'https://www.workandstudyabroad.com.tr/work-in-czech-republic/',
    about_company: 'https://www.workandstudyabroad.com.tr/about-us/',
  };

  constructor(
    @InjectRepository(KnowledgeDocument)
    private knowledgeRepository: Repository<KnowledgeDocument>,
    private httpService: HttpService,
  ) {}

  /**
   * Get document by type
   */
  async getDocumentByType(type: string): Promise<KnowledgeDocument | null> {
    return this.knowledgeRepository.findOne({
      where: {
        documentType: type as DocumentType,
        status: DocumentStatus.ACTIVE,
      },
      order: { fetchedAt: 'DESC' },
    });
  }

  /**
   * Get all active documents
   */
  async getAllDocuments(): Promise<KnowledgeDocument[]> {
    return this.knowledgeRepository.find({
      where: { status: DocumentStatus.ACTIVE },
      order: { documentType: 'ASC', createdAt: 'DESC' },
    });
  }

  /**
   * Search documents by keywords
   */
  async searchDocuments(query: string): Promise<KnowledgeDocument[]> {
    return this.knowledgeRepository
      .createQueryBuilder('doc')
      .where('doc.status = :status', { status: DocumentStatus.ACTIVE })
      .andWhere(
        '(doc.title ILIKE :query OR doc.content ILIKE :query OR doc.keywords @> ARRAY[:query])',
        { query: `%${query}%` },
      )
      .orderBy('doc.usageCount', 'DESC')
      .getMany();
  }

  /**
   * Sync all knowledge sources
   */
  async syncAllSources(): Promise<{
    success: boolean;
    synced: string[];
    failed: string[];
    details: Record<string, { status: string; message: string }>;
  }> {
    const results = {
      success: true,
      synced: [] as string[],
      failed: [] as string[],
      details: {} as Record<string, { status: string; message: string }>,
    };

    for (const [docType, url] of Object.entries(this.sources)) {
      try {
        this.logger.log(`Syncing ${docType} from ${url}`);
        const result = await this.syncSource(url, docType as DocumentType);
        
        if (result) {
          results.synced.push(docType);
          results.details[docType] = { status: 'success', message: 'Synced successfully' };
        } else {
          results.failed.push(docType);
          results.details[docType] = { status: 'unchanged', message: 'Content unchanged' };
        }
      } catch (error) {
        this.logger.error(`Failed to sync ${docType}:`, error.message);
        results.failed.push(docType);
        results.details[docType] = { status: 'error', message: error.message };
        results.success = false;
      }
    }

    return results;
  }

  /**
   * Sync a single source
   */
  private async syncSource(url: string, documentType: DocumentType): Promise<boolean> {
    // Fetch the page
    const response = await lastValueFrom(this.httpService.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 30000,
    }));

    const html = response.data as string;
    const $ = cheerio.load(html);

    // Extract content (customize selectors based on site structure)
    const title = $('h1, .page-title, .entry-title').first().text().trim() || documentType;

    // Remove script and style elements
    $('script, style, nav, footer, header').remove();

    // Extract main content
    let content = '';
    const mainContent = $('main, .content, .entry-content, article, #content').first();

    if (mainContent.length) {
      const sections: string[] = [];
      mainContent.find('h1, h2, h3, h4, h5, h6, p, li').each((_: number, el: any) => {
        const tagName = (el.tagName || el.name || '').toLowerCase();
        const text = $(el).text().trim();
        if (text) {
          if (tagName.startsWith('h')) {
            sections.push(`\n${text}\n${'='.repeat(text.length)}\n`);
          } else if (tagName === 'li') {
            sections.push(`• ${text}`);
          } else {
            sections.push(text);
          }
        }
      });
      content = sections.join('\n\n');
    } else {
      content = $('body').text().trim();
    }

    // Clean up content
    content = this.cleanContent(content);

    // Calculate content hash
    const contentHash = createHash('md5').update(content).digest('hex');

    // Check if content has changed
    const existingDoc = await this.knowledgeRepository.findOne({
      where: { documentType },
      order: { fetchedAt: 'DESC' },
    });

    if (existingDoc && existingDoc.contentHash === contentHash) {
      this.logger.log(`Content for ${documentType} unchanged, skipping update`);
      return false;
    }

    // Extract keywords
    const keywords = this.extractKeywords(content);

    // Create or update document
    const document = this.knowledgeRepository.create({
      title,
      documentType,
      content,
      summary: this.generateSummary(content),
      sourceUrl: url,
      contentHash,
      keywords,
      fetchedAt: new Date(),
      status: DocumentStatus.ACTIVE,
      metadata: {
        wordCount: content.split(/\s+/).length,
        language: 'en',
        lastModified: new Date().toISOString(),
      },
    });

    await this.knowledgeRepository.save(document);

    // Archive old versions
    if (existingDoc) {
      existingDoc.status = DocumentStatus.ARCHIVED;
      await this.knowledgeRepository.save(existingDoc);
    }

    this.logger.log(`Synced ${documentType}: ${title}`);
    return true;
  }

  /**
   * Extract text with structure preserved
   */
  private extractTextWithStructure(element: ReturnType<typeof import('cheerio').load>, $: ReturnType<typeof import('cheerio').load>): string {
    const sections: string[] = [];

    $(element).find('h1, h2, h3, h4, h5, h6, p, li').each((_: number, el: any) => {
      const tagName = (el.tagName || el.name || '').toLowerCase();
      const text = $(el).text().trim();

      if (text) {
        if (tagName.startsWith('h')) {
          sections.push(`\n${text}\n${'='.repeat(text.length)}\n`);
        } else if (tagName === 'li') {
          sections.push(`• ${text}`);
        } else {
          sections.push(text);
        }
      }
    });

    return sections.join('\n\n');
  }

  /**
   * Clean up extracted content
   */
  private cleanContent(content: string): string {
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .replace(/\t+/g, ' ')
      .trim();
  }

  /**
   * Generate summary of content
   */
  private generateSummary(content: string): string {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    return sentences.slice(0, 3).join('. ') + '.';
  }

  /**
   * Extract keywords from content
   */
  private extractKeywords(content: string): string[] {
    const commonWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
      'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'can', 'this', 'that', 'these', 'those', 'a', 'an', 'as', 'if', 'then',
    ]);

    const words = content.toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !commonWords.has(w));

    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  /**
   * Get knowledge for AI context
   */
  async getKnowledgeForContext(
    interestType: string,
    query?: string,
  ): Promise<KnowledgeDocument[]> {
    const documents: KnowledgeDocument[] = [];

    // Always include about company
    const aboutDoc = await this.getDocumentByType('about_company');
    if (aboutDoc) documents.push(aboutDoc);

    // Add interest-specific document
    if (interestType === 'study_in_spain') {
      const spainDoc = await this.getDocumentByType('study_in_spain');
      if (spainDoc) documents.push(spainDoc);
    } else if (interestType === 'work_in_czech') {
      const czechDoc = await this.getDocumentByType('work_in_czech');
      if (czechDoc) documents.push(czechDoc);
    }

    // If query provided, search for additional relevant content
    if (query) {
      const searchResults = await this.searchDocuments(query);
      for (const doc of searchResults) {
        if (!documents.find(d => d.id === doc.id)) {
          documents.push(doc);
        }
      }
    }

    return documents;
  }

  /**
   * Record document usage
   */
  async recordUsage(documentId: string): Promise<void> {
    await this.knowledgeRepository.increment(
      { id: documentId },
      'usageCount',
      1,
    );
    await this.knowledgeRepository.update(
      { id: documentId },
      { lastUsedAt: new Date() },
    );
  }
}
