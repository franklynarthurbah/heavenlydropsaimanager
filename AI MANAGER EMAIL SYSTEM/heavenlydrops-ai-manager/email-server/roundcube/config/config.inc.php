<?php
/**
 * Roundcube Webmail Configuration
 * Heavenly Drops – workandstudyabroad.com.tr
 */

// ── IMAP ────────────────────────────────────────────────────────────────────
$config['imap_host'] = 'ssl://mail.workandstudyabroad.com.tr:993';
$config['imap_timeout'] = 30;
$config['imap_cache'] = 'db';
$config['imap_cache_ttl'] = '10d';
$config['messages_cache'] = true;
$config['messages_cache_ttl'] = '10d';

// ── SMTP ────────────────────────────────────────────────────────────────────
$config['smtp_host'] = 'tls://mail.workandstudyabroad.com.tr:587';
$config['smtp_user'] = '%u';
$config['smtp_pass'] = '%p';
$config['smtp_timeout'] = 30;

// ── Database ─────────────────────────────────────────────────────────────────
// DSN is built from ROUNDCUBEMAIL_DB_* env vars by the Docker entrypoint.
// Leave this blank to let the container set it.
// $config['db_dsnw'] = '';

// ── Branding ────────────────────────────────────────────────────────────────
$config['product_name'] = 'Heavenly Drops Webmail';
$config['skin'] = 'elastic';
$config['support_url'] = 'mailto:support@workandstudyabroad.com.tr';
$config['logo_url'] = '/images/heavenlydrops-logo.png';

// ── Plugins ─────────────────────────────────────────────────────────────────
$config['plugins'] = [
    'archive',
    'zipdownload',
    'managesieve',
    'attachment_reminder',
    'contextmenu',
];

// ── Security ────────────────────────────────────────────────────────────────
$config['use_https'] = true;
$config['login_autocomplete'] = 0;          // disable browser autocomplete on login
$config['login_rate_limit'] = 5;            // block after 5 failed logins per 60 s
$config['session_lifetime'] = 15;           // minutes
$config['session_domain'] = '.workandstudyabroad.com.tr';
$config['session_storage'] = 'db';
$config['ip_check'] = true;
$config['x_frame_options'] = 'sameorigin';

// ── Upload limits ────────────────────────────────────────────────────────────
$config['max_message_size'] = '20M';
$config['upload_progress'] = true;

// ── Default sender ────────────────────────────────────────────────────────────
$config['mail_domain'] = 'workandstudyabroad.com.tr';

// ── Date / time ───────────────────────────────────────────────────────────────
$config['date_format'] = 'Y-m-d';
$config['time_format'] = 'H:i';
$config['timezone'] = 'Europe/Istanbul';

// ── MIME types ────────────────────────────────────────────────────────────────
$config['mime_types'] = '/etc/mime.types';

// ── Special folders ───────────────────────────────────────────────────────────
$config['drafts_mbox'] = 'Drafts';
$config['junk_mbox']   = 'Junk';
$config['sent_mbox']   = 'Sent';
$config['trash_mbox']  = 'Trash';
$config['archive_mbox'] = 'Archive';

// ── Debugging (production: all off) ──────────────────────────────────────────
$config['debug_level'] = 0;
$config['log_driver'] = 'file';
$config['log_dir']    = '/var/log/roundcube/';
$config['per_user_logging'] = false;
