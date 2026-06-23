// Sends transactional email (currently just password-reset links).
//
// Graceful degradation: if RESEND_API_KEY is not set, we DON'T fail — we print
// the reset link to the server console instead. That means the whole feature is
// testable locally with zero setup; adding a real key later switches it to
// actually emailing, with no other code changes.

// Who the email appears to come from. On Resend's free tier (no custom domain)
// you must use their shared sender, onboarding@resend.dev, and can only deliver
// to your own verified address. Override via EMAIL_FROM once you verify a domain.
const FROM = process.env.EMAIL_FROM || 'Charades Night <onboarding@resend.dev>';

async function sendResetEmail(toEmail, resetUrl) {
    const subject = 'Reset your Charades Night password';
    const html =
        `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">` +
        `<h2>Reset your password</h2>` +
        `<p>We received a request to reset your Charades Night password. ` +
        `Click the button below to choose a new one. This link expires in 1 hour.</p>` +
        `<p style="text-align:center;margin:28px 0">` +
        `<a href="${resetUrl}" style="background:#f59e0b;color:#2a1c00;` +
        `padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">` +
        `Reset password</a></p>` +
        `<p>If the button doesn't work, paste this link into your browser:</p>` +
        `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
        `<p style="color:#888;font-size:13px">If you didn't request this, you can safely ignore this email.</p>` +
        `</div>`;

    // No key configured -> log the link so local testing still works.
    if (!process.env.RESEND_API_KEY) {
        console.log(
            '\n[email] RESEND_API_KEY not set — would have emailed a reset link.\n' +
            `[email] To: ${toEmail}\n` +
            `[email] Reset link: ${resetUrl}\n`,
        );
        return;
    }

    // Real send via Resend's REST API (uses Node 18+ built-in fetch — no SDK).
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ from: FROM, to: toEmail, subject, html }),
        });
        if (!res.ok) {
            const detail = await res.text();
            console.error('[email] Resend rejected the send:', res.status, detail);
        } else {
            console.log(`[email] Reset link sent to ${toEmail}`);
        }
    } catch (err) {
        console.error('[email] Failed to call Resend:', err.message);
    }
}

module.exports = { sendResetEmail };
