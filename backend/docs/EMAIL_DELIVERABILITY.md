# Email Deliverability & Health Checker

Complete guide to improving email inbox placement and monitoring sender reputation.

## Overview

This feature set helps ensure your emails land in the inbox instead of spam/junk. It includes:

1. **Enhanced Email Headers** - Proper RFC-compliant headers for better authentication
2. **Email Health Checker** - Pre-send analysis to catch problems before sending
3. **IP Warmup & Rate Limiting** - Gradual sending increase to build reputation
4. **Bounce & Complaint Tracking** - Monitor and suppress problem recipients

## 1. Enhanced Email Headers

### What Changed
All SMTP emails now include comprehensive headers for better deliverability:

```
From: sender@domain.com
Return-Path: sender@domain.com
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8
Content-Transfer-Encoding: 7bit
X-Mailer: Forward Mail System/1.0
X-Originating-IP: [192.168.1.1]
Date: Mon, 01 Jul 2024 12:00:00 +0000
Message-ID: <1720000000.a1b2c3d4e5f6@domain.com>
List-Unsubscribe: <mailto:unsubscribe@domain.com>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

### Benefits
- ✅ SPF/DKIM/DMARC alignment
- ✅ RFC 5322 compliance
- ✅ Better Gmail/Outlook recognition
- ✅ Reduced spam filter triggers
- ✅ Proper authentication signals

## 2. Email Health Checker API

### Pre-Send Health Check

**Endpoint:** `POST /api/email-health/check`

**Request:**
```json
{
  "account_id": 1,
  "subject": "Your Monthly Report",
  "body": "<html>...</html>",
  "sender_email": "noreply@company.com"
}
```

**Response:**
```json
{
  "success": true,
  "health": {
    "score": 85,
    "rating": "good",
    "estimated_inbox_rate": 85,
    "issues": [],
    "warnings": [
      {
        "type": "moderate_bounce_rate",
        "message": "Bounce rate is 2.5%. Consider list cleaning."
      }
    ],
    "recommendations": [
      {
        "priority": "medium",
        "action": "Address warnings to improve deliverability",
        "count": 1
      }
    ]
  },
  "warmup": {
    "stage": 2,
    "stage_description": "🟡 Early Stage - Building reputation",
    "daily_limit": 300,
    "hourly_limit": 50,
    "emails_sent_today": 145,
    "days_sending": 5
  },
  "sender_reputation": {
    "health_score": 90,
    "bounce_rate": 2.5,
    "complaint_rate": 0.08,
    "status": "good",
    "issues": []
  },
  "can_send": true
}
```

### Health Scoring (0-100)

#### Critical Issues (-25 to -30 each)
- High bounce rate (>5%)
- High complaint rate (>0.5%)
- Missing SPF/DKIM/DMARC
- Empty subject or body
- Missing unsubscribe link

#### Warnings (-5 to -15 each)
- Moderate bounce/complaint rates
- All-caps subject lines
- Excessive punctuation
- Too many links
- Missing physical address

#### Score Ranges
- **90-100:** Excellent (95% inbox rate)
- **75-89:** Good (85% inbox rate)
- **60-74:** Fair (70% inbox rate)
- **40-59:** Poor (45% inbox rate)
- **0-39:** Critical (20% inbox rate)

## 3. IP Warmup & Rate Limiting

### Warmup Stages

The system automatically tracks sending age and adjusts limits:

#### Stage 1: New (Days 0-2)
- 🔴 100 emails/day
- 20 emails/hour
- 5 second delay between emails
- Status: Limited sending

#### Stage 2: Early (Days 3-6)
- 🟡 300 emails/day
- 50 emails/hour
- 3 second delay between emails
- Status: Building reputation

#### Stage 3: Intermediate (Days 7-13)
- 🟠 1,000 emails/day
- 100 emails/hour
- 2 second delay between emails
- Status: Improving reputation

#### Stage 4: Established (Days 14+)
- 🟢 5,000 emails/day
- 500 emails/hour
- 1 second delay between emails
- Status: Full capacity

### Rate Limiting Endpoints

**Check Rate Limit:**
```bash
POST /api/email-health/check-rate-limit
{
  "account_id": 1,
  "emails_to_send": 50
}
```

**Get Warmup Status:**
```bash
GET /api/email-health/warmup-status/1
```

## 4. Bounce & Complaint Tracking

### Tracking Tables

#### email_bounces
- Stores all bounced emails
- Tracks bounce type (hard/soft)
- Records bounce reason
- Hard bounces added to suppression list

#### email_complaints
- Tracks spam complaints
- Records complaint source (user, ISP, etc)
- Automatically suppresses complaining addresses

#### email_suppressions
- Active suppression list
- Prevents sending to problem recipients
- Tracks suppression reason
- Supports manual removal (opt-back-in)

### Key Metrics

**Bounce Rate**
- Hard bounces: Permanent failures (invalid address)
- Soft bounces: Temporary failures (mailbox full)
- Target: <2%
- Critical: >5%

**Complaint Rate**
- Users marking emails as spam
- Target: <0.1%
- Critical: >0.5%

### Monitoring Endpoints

**Sender Reputation:**
```bash
GET /api/email-health/sender-reputation/1

Response:
{
  "health_score": 85,
  "bounce_rate": 1.8,
  "complaint_rate": 0.05,
  "status": "good",
  "issues": []
}
```

**Bounce Report (7 days):**
```bash
GET /api/email-health/bounce-report/1?days=7

Response:
{
  "bounces_by_day": [...],
  "top_bounce_reasons": [
    {"reason": "User unknown", "count": 12},
    {"reason": "Mailbox full", "count": 8}
  ],
  "total_bounces": 20
}
```

**Complaint Report (7 days):**
```bash
GET /api/email-health/complaint-report/1?days=7
```

**Suppression List:**
```bash
GET /api/email-health/suppression-list/1?limit=100&offset=0
```

## 5. Frontend Integration

### Pre-Send Health Check Modal

Before sending, show users:

```
╔═══════════════════════════════════════╗
║    📊 Email Health Check              ║
╠═══════════════════════════════════════╣
║ Score: 85/100 - Good                  ║
║ Estimated Inbox Rate: 85%             ║
║                                       ║
║ ⚠️ Warnings: 1                        ║
║ • Bounce rate is 2.5%                 ║
║                                       ║
║ 🔄 Warmup Status: Stage 2             ║
║ • Daily limit: 300/300                ║
║ • Hourly limit: 50/50                 ║
║                                       ║
║ ✅ Ready to send                      ║
╠═══════════════════════════════════════╣
║ [Cancel]          [Send Email]        ║
╚═══════════════════════════════════════╝
```

### Reputation Dashboard

Show ongoing sender health:

```
Sender Reputation Score: 85/100 (Good)

Bounce Rate: 1.8% ✓
Complaint Rate: 0.05% ✓

Recent Issues (7 days):
• 20 bounces (most: user unknown)
• 1 complaint

Warmup Progress:
[████████░░] Stage 2 of 4 (5 days sending)
Next stage in 2 days

Recommendations:
✓ Start with small batches
✓ Remove bounces immediately
✓ Monitor engagement rates
```

## 6. Backend Integration

### Recording Bounces

When email fails (SMTP error, webhook bounce):

```php
$bounceTracker = app(BounceComplaintTrackerService::class);
$bounceTracker->recordBounce(
    accountId: $account->id,
    email: 'invalid@example.com',
    type: 'hard',
    reason: 'User unknown'
);
```

### Recording Complaints

When user marks email as spam:

```php
$bounceTracker->recordComplaint(
    accountId: $account->id,
    email: 'user@example.com',
    source: 'user'
);
```

### Rate Limiting Before Send

```php
$warmup = app(IPWarmupService::class);
$check = $warmup->checkRateLimit($accountId, $emailsToSend);

if (!$check['canSend']) {
    return response()->json([
        'error' => $check['message'],
        'delay' => $check['delay'],
    ], 429); // Too Many Requests
}

// Send emails...
$warmup->recordSent($accountId, count($recipients));
```

### Health Check Before Bulk Send

```php
$healthChecker = app(EmailHealthCheckerService::class);
$report = $healthChecker->checkEmailHealth(
    senderEmail: $from,
    subject: $subject,
    body: $body,
    domain: $domain,
    accountId: $accountId
);

if (!empty($report['issues'])) {
    return response()->json([
        'error' => 'Email has critical issues',
        'issues' => $report['issues'],
    ], 422);
}
```

## 7. Database Setup

Run the migration to create tables:

```bash
php artisan migrate
```

Creates:
- `email_bounces`
- `email_complaints`
- `email_suppressions`
- `email_health_logs`

## 8. Best Practices

### For Best Inbox Placement

1. **Start Slow**
   - First week: 50-100 emails/day
   - Week 2: 200-300 emails/day
   - Week 3+: Gradually increase

2. **Monitor Metrics**
   - Check bounce rates daily
   - Monitor complaint rates
   - Remove bounces immediately

3. **Content Quality**
   - Use professional language
   - Avoid spam trigger words
   - Include unsubscribe link
   - Add physical address
   - Balance text and images

4. **Authentication**
   - Set up SPF, DKIM, DMARC
   - Ensure domain alignment
   - Use proper From headers

5. **Engagement**
   - Target engaged recipients
   - Remove unengaged after 6 months
   - A/B test subject lines
   - Monitor open/click rates

### Warning Signs

🔴 **Critical** (Act immediately)
- Bounce rate >5%
- Complaint rate >0.5%
- Domain blacklisted

🟠 **High Priority** (Address within 24h)
- Bounce rate 2-5%
- Complaint rate 0.1-0.5%
- SPF/DKIM missing

🟡 **Medium Priority** (Address this week)
- Bounce rate 1-2%
- Complaint rate 0.05-0.1%
- Missing unsubscribe link

## 9. Troubleshooting

### "Too many emails" error
- You're in an early warmup stage
- Wait for next stage (based on days sending)
- Or spread sends across hours

### Low inbox rate despite good score
- Check if SPF/DKIM/DMARC aligned
- Monitor bounce/complaint rates
- Review email content for spam triggers
- Ensure good authentication

### High bounce rate
- Clean list of invalid emails
- Verify all emails before sending
- Remove hard bounces from list

### High complaint rate
- Review email content
- Check if recipients opted in
- Reduce sending frequency
- Improve content relevance

## 10. Monitoring & Alerts

Consider setting up alerts for:

```
- Bounce rate >3%
- Complaint rate >0.2%
- IP reputation dropped
- Domain blacklisted
- Suppression list growing >10/day
```

Implement webhook handlers in `WebhookController` to track deliverability events from ISPs.
