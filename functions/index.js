"use strict";

const { initializeApp } = require("firebase-admin/app");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const nodemailer = require("nodemailer");

initializeApp();

const IONOS_EMAIL = defineSecret("IONOS_EMAIL");
const IONOS_PASSWORD = defineSecret("IONOS_PASSWORD");

const DEFAULT_ADMIN_EMAILS = [
  "danyal1995@hotmail.co.uk",
  "danyalc95@gmail.com"
];

const EMAIL_FUNCTION_OPTIONS = {
  cors: true,
  region: "us-central1",
  secrets: [IONOS_EMAIL, IONOS_PASSWORD],
  maxInstances: 2,
  timeoutSeconds: 60,
  memory: "256MiB"
};

const DEPLOY_MARKER = "email-functions-20260604-secret-check";
const EMAIL_FOLDER_CONFIG = {
  inbox: {
    label: "Inbox",
    specialUse: ["\\Inbox"],
    aliases: ["inbox"]
  },
  drafts: {
    label: "Drafts",
    specialUse: ["\\Drafts"],
    aliases: ["drafts", "draft"]
  },
  sent: {
    label: "Sent",
    specialUse: ["\\Sent"],
    aliases: ["sent", "sent items", "sent messages", "sent mail"]
  },
  spam: {
    label: "Spam",
    specialUse: ["\\Junk"],
    aliases: ["spam", "junk", "junk email"]
  },
  trash: {
    label: "Trash",
    specialUse: ["\\Trash"],
    aliases: ["trash", "deleted", "deleted items", "bin"]
  }
};

function getAllowedAdminEmails() {
  return String(process.env.ADMIN_EMAIL_ALLOWLIST || DEFAULT_ADMIN_EMAILS.join(","))
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function assertAdmin(request) {
  const email = String(request.auth?.token?.email || "").toLowerCase();

  if (!email || !getAllowedAdminEmails().includes(email)) {
    throw new HttpsError("permission-denied", "You are not authorised to use admin email functions.");
  }

  return email;
}

function getMailboxConfig() {
  return {
    email: IONOS_EMAIL.value().trim(),
    password: IONOS_PASSWORD.value().trim(),
    imapHost: process.env.IMAP_HOST || "imap.ionos.com",
    imapPort: Number.parseInt(process.env.IMAP_PORT || "993", 10),
    smtpHost: process.env.SMTP_HOST || "smtp.ionos.com",
    smtpPort: Number.parseInt(process.env.SMTP_PORT || "587", 10),
    smtpSecure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    fromName: process.env.MAIL_FROM_NAME || "Half Awake Eyes"
  };
}

function getImapHosts() {
  const config = getMailboxConfig();
  const hosts = [
    config.imapHost,
    "imap.ionos.co.uk",
    "imap.ionos.com"
  ];

  return [...new Set(hosts.filter(Boolean))];
}

function createImapClient(host) {
  const config = getMailboxConfig();
  return new ImapFlow({
    host,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: {
      user: config.email,
      pass: config.password
    },
    logger: false
  });
}

function getSmtpConfigs() {
  const config = getMailboxConfig();
  const baseConfigs = [
    {
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure
    },
    {
      host: "smtp.ionos.co.uk",
      port: 587,
      secure: false
    },
    {
      host: "smtp.ionos.com",
      port: 587,
      secure: false
    },
    {
      host: "smtp.ionos.co.uk",
      port: 465,
      secure: true
    },
    {
      host: "smtp.ionos.com",
      port: 465,
      secure: true
    }
  ];

  const seen = new Set();
  return baseConfigs.filter((entry) => {
    const key = `${entry.host}:${entry.port}:${entry.secure}`;
    if (!entry.host || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function createSmtpTransport(smtpConfig) {
  const config = getMailboxConfig();
  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: config.email,
      pass: config.password
    }
  });
}

function createMessageBufferTransport() {
  return nodemailer.createTransport({
    streamTransport: true,
    buffer: true
  });
}

function formatAddress(address) {
  if (!address) {
    return "";
  }

  if (Array.isArray(address)) {
    return address
      .map(formatAddress)
      .filter(Boolean)
      .join(", ");
  }

  const name = String(address.name || "").trim();
  const email = String(address.address || "").trim();

  if (name && email) {
    return `${name} <${email}>`;
  }

  return email || name;
}

function getTextPreview(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function serializeDate(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object" && typeof value.toISOString === "function") {
    return value.toISOString();
  }

  return String(value);
}

function normalizeUid(value) {
  const uid = Number.parseInt(String(value || ""), 10);

  if (!Number.isFinite(uid) || uid <= 0) {
    throw new HttpsError("invalid-argument", "A valid message id is required.");
  }

  return uid;
}

function normalizeEmailFolder(value) {
  const folder = String(value || "inbox").trim().toLowerCase();
  return EMAIL_FOLDER_CONFIG[folder] ? folder : "inbox";
}

function flattenMailboxes(mailboxes = []) {
  const flattened = [];

  mailboxes.forEach((mailbox) => {
    flattened.push(mailbox);
    if (Array.isArray(mailbox.children) && mailbox.children.length) {
      flattened.push(...flattenMailboxes(mailbox.children));
    }
  });

  return flattened;
}

function mailboxPath(mailbox) {
  return String(mailbox?.path || mailbox?.name || "").trim();
}

function mailboxNameMatches(mailbox, aliases) {
  const path = mailboxPath(mailbox).toLowerCase();
  const name = String(mailbox?.name || "").trim().toLowerCase();

  return aliases.some((alias) => path === alias || name === alias || path.endsWith(`/${alias}`) || path.endsWith(`.${alias}`));
}

function mailboxSpecialUseMatches(mailbox, specialUses) {
  const values = [
    mailbox?.specialUse,
    mailbox?.specialuse,
    ...(Array.isArray(mailbox?.flags) ? mailbox.flags : [])
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return specialUses.some((specialUse) => values.includes(String(specialUse).toLowerCase()));
}

async function resolveMailboxPath(client, folder) {
  if (folder === "inbox") {
    return "INBOX";
  }

  const config = EMAIL_FOLDER_CONFIG[folder] || EMAIL_FOLDER_CONFIG.inbox;
  const mailboxes = flattenMailboxes(await client.list());
  const bySpecialUse = mailboxes.find((mailbox) => mailboxSpecialUseMatches(mailbox, config.specialUse));
  const byAlias = mailboxes.find((mailbox) => mailboxNameMatches(mailbox, config.aliases));
  const match = bySpecialUse || byAlias;

  if (!match) {
    throw new HttpsError("not-found", `${config.label} folder was not found in this mailbox.`);
  }

  return mailboxPath(match);
}

async function withMailbox(folder, callback) {
  const hosts = getImapHosts();
  let lastError = null;
  const attempts = [];

  for (const host of hosts) {
    const client = createImapClient(host);
    attempts.push(host);
    console.log("Connecting to IMAP host", { host });

    try {
      await client.connect();
      const resolvedPath = await resolveMailboxPath(client, folder);
      await client.mailboxOpen(resolvedPath);
      return await callback(client, resolvedPath);
    } catch (error) {
      lastError = error;
      console.warn("IMAP connection failed", {
        host,
        authenticationFailed: Boolean(error?.authenticationFailed),
        responseStatus: error?.responseStatus || "",
        responseText: error?.responseText || "",
        message: error?.message || ""
      });
    } finally {
      try {
        await client.logout();
      } catch (error) {
        // The client may not have connected successfully.
      }
    }
  }

  if (lastError?.authenticationFailed || /authentication failed/i.test(String(lastError?.responseText || lastError?.message || ""))) {
    throw new HttpsError(
      "failed-precondition",
      `IONOS mailbox login failed for ${attempts.join(", ")}. Check the mailbox address/password and confirm direct IMAP access is enabled.`
    );
  }

  throw lastError || new HttpsError("internal", "Could not connect to the IONOS mailbox.");
}

async function appendSentCopy(mailOptions) {
  const bufferTransport = createMessageBufferTransport();
  const rawInfo = await bufferTransport.sendMail(mailOptions);
  const rawMessage = rawInfo.message;

  if (!rawMessage) {
    return;
  }

  await withMailbox("sent", async (client, path) => {
    await client.append(path, rawMessage, ["\\Seen"], new Date());
  });
}

exports.listInboxMessages = onCall(EMAIL_FUNCTION_OPTIONS, async (request) => {
  assertAdmin(request);
  console.log("listInboxMessages running", { deployMarker: DEPLOY_MARKER });

  const requestedLimit = Number.parseInt(String(request.data?.limit || "25"), 10);
  const limit = Math.min(Math.max(requestedLimit || 25, 1), 50);
  const folder = normalizeEmailFolder(request.data?.folder);

  return withMailbox(folder, async (client, path) => {
    const mailboxSize = Number(client.mailbox?.exists || 0);

    if (!mailboxSize) {
      return { folder, path, messages: [] };
    }

    const startSequence = Math.max(1, mailboxSize - limit + 1);
    const messages = [];

    for await (const message of client.fetch(`${startSequence}:*`, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true
    })) {
      const envelope = message.envelope || {};
      const flags = Array.from(message.flags || []);

      messages.push({
        id: String(message.uid),
        from: formatAddress(envelope.from),
        to: formatAddress(envelope.to),
        subject: envelope.subject || "(No subject)",
        date: serializeDate(envelope.date || message.internalDate),
        preview: "",
        folder,
        unread: !flags.includes("\\Seen")
      });
    }

    messages.sort((a, b) => Number(b.id) - Number(a.id));
    return { folder, path, messages };
  });
});

exports.getEmailMessage = onCall(EMAIL_FUNCTION_OPTIONS, async (request) => {
  assertAdmin(request);

  const uid = normalizeUid(request.data?.id);
  const folder = normalizeEmailFolder(request.data?.folder);

  return withMailbox(folder, async (client) => {
    const message = await client.fetchOne(uid, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
      source: true
    }, { uid: true });

    if (!message) {
      throw new HttpsError("not-found", "Email message not found.");
    }

    const parsed = await simpleParser(message.source);
    const envelope = message.envelope || {};
    const flags = Array.from(message.flags || []);

    await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });

    return {
      message: {
        id: String(message.uid || uid),
        from: formatAddress(envelope.from) || parsed.from?.text || "",
        to: formatAddress(envelope.to) || parsed.to?.text || "",
        subject: parsed.subject || envelope.subject || "(No subject)",
        date: serializeDate(parsed.date || envelope.date || message.internalDate),
        preview: getTextPreview(parsed.text || parsed.html || ""),
        text: parsed.text || "",
        html: parsed.html || "",
        folder,
        unread: !flags.includes("\\Seen")
      }
    };
  });
});

exports.trashEmailMessage = onCall(EMAIL_FUNCTION_OPTIONS, async (request) => {
  assertAdmin(request);

  const uid = normalizeUid(request.data?.id);
  const folder = normalizeEmailFolder(request.data?.folder);

  if (folder === "trash") {
    throw new HttpsError("failed-precondition", "This message is already in Trash.");
  }

  return withMailbox(folder, async (client) => {
    const trashPath = await resolveMailboxPath(client, "trash");
    await client.messageMove(String(uid), trashPath, { uid: true });
    return {
      ok: true,
      id: String(uid),
      folder,
      destination: "trash"
    };
  });
});

exports.sendAdminEmail = onCall(EMAIL_FUNCTION_OPTIONS, async (request) => {
  const adminEmail = assertAdmin(request);
  const config = getMailboxConfig();
  const to = String(request.data?.to || "").trim();
  const bcc = String(request.data?.bcc || "").trim();
  const subject = String(request.data?.subject || "").trim();
  const text = String(request.data?.text || "").trim();
  const html = String(request.data?.html || "").trim();

  if ((!to && !bcc) || !subject || !text) {
    throw new HttpsError("invalid-argument", "Recipient, subject, and message text are required.");
  }

  const mailOptions = {
    from: {
      name: config.fromName,
      address: config.email
    },
    to,
    bcc: bcc || undefined,
    replyTo: config.email,
    subject,
    text,
    html: html || undefined,
    headers: {
      "X-HAE-Admin-User": adminEmail
    }
  };

  let result = null;
  let lastSmtpError = null;

  for (const smtpConfig of getSmtpConfigs()) {
    console.log("Sending through SMTP host", {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure
    });

    try {
      const transporter = createSmtpTransport(smtpConfig);
      result = await transporter.sendMail(mailOptions);
      break;
    } catch (error) {
      lastSmtpError = error;
      console.warn("SMTP send failed", {
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        code: error?.code || "",
        responseCode: error?.responseCode || "",
        response: error?.response || "",
        command: error?.command || "",
        message: error?.message || ""
      });
    }
  }

  if (!result) {
    if (lastSmtpError?.code === "EAUTH" || lastSmtpError?.responseCode === 535) {
      throw new HttpsError(
        "failed-precondition",
        "IONOS SMTP login failed. IMAP can work while SMTP requires the mailbox password, SMTP access, or a regional SMTP server setting."
      );
    }

    throw new HttpsError("internal", "Could not send email through IONOS SMTP.");
  }

  try {
    await appendSentCopy(mailOptions);
  } catch (error) {
    console.warn("Could not append sent email copy.", {
      message: error?.message || "",
      responseText: error?.responseText || ""
    });
  }

  return {
    ok: true,
    messageId: result.messageId || ""
  };
});
