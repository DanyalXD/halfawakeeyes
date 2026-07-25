"use strict";

const crypto = require("crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { HttpsError, onCall, onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const nodemailer = require("nodemailer");

initializeApp();

const db = getFirestore();
const ADMIN_SITE_URL = "https://halfawakeeyes.co.uk";

exports.getPublicLinksJson = onRequest({
  cors: true,
  region: "us-central1",
  maxInstances: 2,
  timeoutSeconds: 15,
  memory: "128MiB"
}, async (request, response) => {
  if (request.method !== "GET") {
    response.set("Allow", "GET");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const [linksSnapshot, gigsSnapshot] = await Promise.all([
    db.doc("links/public-index").get(),
    db.doc("gigs/public-index").get()
  ]);
  const links = linksSnapshot.data()?.items;
  const gigs = gigsSnapshot.data()?.items;
  const publicLinks = (Array.isArray(links) ? links : []).filter((link) =>
    String(link?.section || "").trim().toLowerCase() !== "resources"
  );

  response.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=86400");
  response.status(200).json({
    links: publicLinks,
    gigs: Array.isArray(gigs) ? gigs : []
  });
});

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

const PUSH_FUNCTION_OPTIONS = {
  cors: true,
  region: "us-central1",
  maxInstances: 2,
  timeoutSeconds: 30,
  memory: "256MiB"
};

const EMAIL_NOTIFICATION_SCHEDULE_OPTIONS = {
  region: "us-central1",
  schedule: "every 5 minutes",
  timeZone: "Europe/London",
  secrets: [IONOS_EMAIL, IONOS_PASSWORD],
  maxInstances: 1,
  timeoutSeconds: 60,
  memory: "256MiB"
};

const DEPLOY_MARKER = "email-functions-20260604-secret-check";
const PUSH_TOKENS_COLLECTION = "admin-email-push-tokens";
const NOTIFICATION_SETTINGS_COLLECTION = "admin-notification-settings";
const EMAIL_NOTIFICATION_STATE_COLLECTION = "admin-email-notification-state";
const EMAIL_NOTIFICATION_STATE_DOC = "inbox";
const MAX_EMAIL_ATTACHMENT_COUNT = 5;
const MAX_EMAIL_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const DEFAULT_NOTIFICATION_SETTINGS = {
  emailNewMessages: true,
  mailingListSignups: true,
  siteActions: {
    page_view: false,
    click: true,
    email_signup: false,
    video_play: false,
    ticket_redirect_continue: true,
    ticket_redirect_unavailable: true
  }
};
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
    imapHost: process.env.IMAP_HOST || "imap.ionos.co.uk",
    imapPort: Number.parseInt(process.env.IMAP_PORT || "993", 10),
    smtpHost: process.env.SMTP_HOST || "smtp.ionos.com",
    smtpPort: Number.parseInt(process.env.SMTP_PORT || "587", 10),
    smtpSecure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    fromName: process.env.MAIL_FROM_NAME || "Half Awake Eyes"
  };
}

function logMailboxCredentialDiagnostic(source) {
  const rawEmail = IONOS_EMAIL.value();
  const rawPassword = IONOS_PASSWORD.value();

  console.log("Mailbox credential diagnostic", {
    source,
    email: rawEmail.trim(),
    emailLength: rawEmail.length,
    passwordLength: rawPassword.length,
    emailTrimmed: rawEmail !== rawEmail.trim(),
    passwordTrimmed: rawPassword !== rawPassword.trim()
  });
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

function getAttachmentByteLength(base64Value = "") {
  return Buffer.byteLength(String(base64Value || ""), "base64");
}

function normalizeParsedAttachments(attachments = []) {
  let totalBytes = 0;
  return attachments
    .filter((attachment) => attachment?.content && attachment.filename)
    .slice(0, MAX_EMAIL_ATTACHMENT_COUNT)
    .filter((attachment) => {
      const size = Number(attachment.size || attachment.content?.length || 0);
      totalBytes += size;
      return totalBytes <= MAX_EMAIL_ATTACHMENT_BYTES;
    })
    .map((attachment, index) => ({
      id: attachment.cid || attachment.checksum || `attachment-${index + 1}`,
      filename: String(attachment.filename || `attachment-${index + 1}`).slice(0, 180),
      contentType: String(attachment.contentType || "application/octet-stream").slice(0, 120),
      size: Number(attachment.size || attachment.content?.length || 0),
      content: attachment.content.toString("base64")
    }));
}

function normalizeOutgoingAttachments(value = []) {
  if (!Array.isArray(value) || !value.length) {
    return [];
  }

  if (value.length > MAX_EMAIL_ATTACHMENT_COUNT) {
    throw new HttpsError("invalid-argument", `Attach up to ${MAX_EMAIL_ATTACHMENT_COUNT} files per email.`);
  }

  let totalBytes = 0;
  return value.map((attachment, index) => {
    const filename = String(attachment?.filename || `attachment-${index + 1}`).trim().slice(0, 180);
    const contentType = String(attachment?.contentType || "application/octet-stream").trim().slice(0, 120);
    const content = String(attachment?.content || "").trim();
    const size = getAttachmentByteLength(content);
    totalBytes += size;

    if (!filename || !content || size <= 0) {
      throw new HttpsError("invalid-argument", "Each attachment needs a file name and file content.");
    }

    if (totalBytes > MAX_EMAIL_ATTACHMENT_BYTES) {
      throw new HttpsError("invalid-argument", "Attachments are too large. Keep the total under 6 MB.");
    }

    return {
      filename,
      content: Buffer.from(content, "base64"),
      contentType
    };
  });
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

function normalizeOptionalUid(value) {
  const uid = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(uid) && uid > 0 ? uid : 0;
}

function normalizeMailboxSearch(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function normalizeEmailFolder(value) {
  const folder = String(value || "inbox").trim().toLowerCase();
  return EMAIL_FOLDER_CONFIG[folder] ? folder : "inbox";
}

function getPushTokenDocId(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function getNotificationTitle(message) {
  return message.subject && message.subject !== "(No subject)" ? message.subject : "New email";
}

function getNotificationBody(message) {
  const sender = String(message.from || "Unknown sender").trim();
  const preview = String(message.preview || "").trim();
  return [sender, preview].filter(Boolean).join(" - ").slice(0, 180) || "A new inbox message arrived.";
}

function mergeNotificationSettings(settings = {}) {
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...settings,
    siteActions: {
      ...DEFAULT_NOTIFICATION_SETTINGS.siteActions,
      ...(settings.siteActions || {})
    }
  };
}

function getNotificationSettingsCacheKey(tokenEntry = {}) {
  return tokenEntry.adminEmail || tokenEntry.adminUid || "default";
}

async function getNotificationSettingsForToken(tokenEntry = {}, cache = new Map()) {
  const cacheKey = getNotificationSettingsCacheKey(tokenEntry);

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const docId = String(tokenEntry.adminEmail || tokenEntry.adminUid || "default").trim();
  const snapshot = await db.collection(NOTIFICATION_SETTINGS_COLLECTION).doc(docId).get();
  const settings = mergeNotificationSettings(snapshot.exists ? snapshot.data() : {});
  cache.set(cacheKey, settings);
  return settings;
}

async function getAdminPushTokens() {
  const snapshot = await db.collection(PUSH_TOKENS_COLLECTION).where("enabled", "==", true).get();
  return snapshot.docs
    .map((docSnapshot) => ({
      id: docSnapshot.id,
      token: String(docSnapshot.data()?.token || "").trim(),
      adminUid: String(docSnapshot.data()?.adminUid || "").trim(),
      adminEmail: String(docSnapshot.data()?.adminEmail || "").trim().toLowerCase()
    }))
    .filter((entry) => entry.token);
}

async function disableInvalidPushTokens(results, tokenEntries) {
  const writes = [];

  results.responses.forEach((response, index) => {
    if (response.success) {
      return;
    }

    const code = response.error?.code || "";
    if (!["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(code)) {
      return;
    }

    const tokenEntry = tokenEntries[index];
    if (tokenEntry?.id) {
      writes.push(db.collection(PUSH_TOKENS_COLLECTION).doc(tokenEntry.id).set({
        enabled: false,
        disabledAt: FieldValue.serverTimestamp(),
        disabledReason: code
      }, { merge: true }));
    }
  });

  await Promise.all(writes);
}

function summarizePushFailures(results, tokenEntries) {
  return results.responses
    .map((response, index) => {
      if (response.success) {
        return null;
      }

      const tokenEntry = tokenEntries[index] || {};
      const token = String(tokenEntry.token || "");
      return {
        code: response.error?.code || "unknown",
        message: response.error?.message || "Unknown push send failure",
        adminEmail: tokenEntry.adminEmail || "",
        tokenSuffix: token ? token.slice(-8) : ""
      };
    })
    .filter(Boolean);
}

async function sendNewEmailNotification(message, newMessageCount = 1) {
  return sendAdminPushNotification({
    title: newMessageCount > 1 ? `${newMessageCount} new emails` : getNotificationTitle(message),
    body: getNotificationBody(message),
    data: {
      type: "admin-email",
      messageId: String(message.id || ""),
      folder: "inbox",
      subject: String(message.subject || ""),
      sender: String(message.from || ""),
      preview: String(message.preview || "")
    },
    tag: "hae-admin-email",
    isEnabled: (settings) => Boolean(settings.emailNewMessages)
  });
}

function getAdminNotificationLink(data = {}) {
  const type = String(data.type || "").trim();

  if (type === "admin-email") {
    return `${ADMIN_SITE_URL}/admin.html?page=email&emailView=mail`;
  }

  if (type === "mailing-list-signup") {
    return `${ADMIN_SITE_URL}/admin.html?page=email&emailView=address-book`;
  }

  if (type === "site-action") {
    return `${ADMIN_SITE_URL}/admin.html?page=analytics&collection=site-actions`;
  }

  return `${ADMIN_SITE_URL}/admin.html`;
}

async function sendAdminPushNotification({ title, body, data = {}, tag = "hae-admin-alert", isEnabled = () => true }) {
  const tokenEntries = await getAdminPushTokens();

  if (!tokenEntries.length) {
    console.log("No admin push tokens registered; skipping notification.", { title });
    return { sent: 0, failed: 0 };
  }

  const settingsCache = new Map();
  const enabledTokenEntries = [];

  for (const tokenEntry of tokenEntries) {
    const settings = await getNotificationSettingsForToken(tokenEntry, settingsCache);
    if (isEnabled(settings, tokenEntry)) {
      enabledTokenEntries.push(tokenEntry);
    }
  }

  console.log("Admin push notification token filter", {
    title,
    tag,
    tokenCount: tokenEntries.length,
    enabledTokenCount: enabledTokenEntries.length,
    settingsOwners: settingsCache.size
  });

  if (!enabledTokenEntries.length) {
    console.log("No admin push tokens opted in for this notification.", { title, tag });
    return { sent: 0, failed: 0, skipped: true };
  }

  const payloadData = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value || "")]));
  const notificationLink = getAdminNotificationLink(payloadData);
  const notificationData = {
    ...payloadData,
    pushTitle: String(title || ""),
    pushBody: String(body || ""),
    tag,
    url: notificationLink
  };
  const results = await getMessaging().sendEachForMulticast({
    tokens: enabledTokenEntries.map((entry) => entry.token),
    webpush: {
      headers: {
        Urgency: "high"
      },
      fcmOptions: {
        link: notificationLink
      }
    },
    data: notificationData
  });

  await disableInvalidPushTokens(results, enabledTokenEntries);
  const failures = summarizePushFailures(results, enabledTokenEntries);
  console.log("Admin push notification send result", {
    title,
    tag,
    sent: results.successCount,
    failed: results.failureCount,
    failures
  });

  return {
    sent: results.successCount,
    failed: results.failureCount
  };
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

async function withMailbox(folder, callback, options = {}) {
  const hosts = Array.isArray(options.hosts) && options.hosts.length
    ? [...new Set(options.hosts.filter(Boolean))]
    : getImapHosts();
  let lastError = null;
  const attempts = [];

  for (const host of hosts) {
    const client = createImapClient(host);
    attempts.push(host);
    console.log("Connecting to IMAP host", { host });

    try {
      await client.connect();
      console.log("IMAP connection succeeded", { host });
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

async function fetchMailboxMessages(folder, limit, options = {}) {
  return withMailbox(folder, async (client, path) => {
    const mailboxSize = Number(client.mailbox?.exists || 0);
    const sinceUid = normalizeOptionalUid(options.sinceUid);
    const beforeUid = normalizeOptionalUid(options.beforeUid);
    const searchTerm = normalizeMailboxSearch(options.search);

    if (!mailboxSize) {
      return { folder, path, messages: [], sinceUid, beforeUid, search: searchTerm };
    }

    if (beforeUid <= 1 && beforeUid) {
      return { folder, path, messages: [], sinceUid, beforeUid, search: searchTerm };
    }

    const uidNext = Number(client.mailbox?.uidNext || 0);
    const startSequence = Math.max(1, mailboxSize - limit + 1);
    const fetchRange = sinceUid
      ? `${sinceUid + 1}:*`
      : beforeUid
        ? `1:${Math.max(1, beforeUid - 1)}`
        : `${startSequence}:*`;
    const fetchOptions = sinceUid || beforeUid ? { uid: true } : undefined;
    const messages = [];

    if (sinceUid && uidNext && sinceUid + 1 >= uidNext) {
      return { folder, path, messages: [], sinceUid, beforeUid, search: searchTerm };
    }

    if (searchTerm) {
      const matchingUids = await client.search({ text: searchTerm }, { uid: true });
      const selectedUids = Array.isArray(matchingUids)
        ? matchingUids
          .map((uid) => Number(uid || 0))
          .filter((uid) => uid > 0)
          .filter((uid) => !sinceUid || uid > sinceUid)
          .filter((uid) => !beforeUid || uid < beforeUid)
          .sort((a, b) => b - a)
          .slice(0, limit)
        : [];

      if (!selectedUids.length) {
        return { folder, path, messages: [], sinceUid, beforeUid, search: searchTerm };
      }

      for await (const message of client.fetch(selectedUids, {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true
      }, { uid: true })) {
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
      return { folder, path, messages, sinceUid, beforeUid, search: searchTerm };
    }

    for await (const message of client.fetch(fetchRange, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true
    }, fetchOptions)) {
      const envelope = message.envelope || {};
      const flags = Array.from(message.flags || []);

      const uid = Number(message.uid || 0);
      if ((sinceUid && uid <= sinceUid) || (beforeUid && uid >= beforeUid)) {
        continue;
      }

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
    return { folder, path, messages: beforeUid ? messages.slice(0, limit) : messages, sinceUid, beforeUid, search: searchTerm };
  }, options);
}

exports.listInboxMessages = onCall(EMAIL_FUNCTION_OPTIONS, async (request) => {
  assertAdmin(request);
  console.log("listInboxMessages running", { deployMarker: DEPLOY_MARKER });
  logMailboxCredentialDiagnostic("listInboxMessages");

  const requestedLimit = Number.parseInt(String(request.data?.limit || "25"), 10);
  const limit = Math.min(Math.max(requestedLimit || 25, 1), 50);
  const folder = normalizeEmailFolder(request.data?.folder);
  const sinceUid = normalizeOptionalUid(request.data?.sinceUid);
  const beforeUid = normalizeOptionalUid(request.data?.beforeUid);
  const search = normalizeMailboxSearch(request.data?.search);

  return fetchMailboxMessages(folder, limit, { sinceUid, beforeUid, search });
});

exports.registerEmailPushToken = onCall(PUSH_FUNCTION_OPTIONS, async (request) => {
  const adminEmail = assertAdmin(request);
  const adminUid = String(request.auth?.uid || "").trim();
  const token = String(request.data?.token || "").trim();

  if (!token || token.length < 40) {
    throw new HttpsError("invalid-argument", "A valid push token is required.");
  }

  const docId = getPushTokenDocId(token);
  await db.collection(PUSH_TOKENS_COLLECTION).doc(docId).set({
    token,
    adminUid,
    adminEmail,
    enabled: true,
    permission: String(request.data?.permission || ""),
    userAgent: String(request.data?.userAgent || "").slice(0, 500),
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true };
});

exports.checkInboxForPushNotifications = onSchedule(EMAIL_NOTIFICATION_SCHEDULE_OPTIONS, async () => {
  console.log("checkInboxForPushNotifications running", { deployMarker: DEPLOY_MARKER });
  logMailboxCredentialDiagnostic("checkInboxForPushNotifications");

  const stateRef = db.collection(EMAIL_NOTIFICATION_STATE_COLLECTION).doc(EMAIL_NOTIFICATION_STATE_DOC);
  const stateSnapshot = await stateRef.get();
  const lastSeenUid = Number.parseInt(String(stateSnapshot.data()?.lastSeenUid || "0"), 10) || 0;
  const mailboxConfig = getMailboxConfig();
  const { messages } = await fetchMailboxMessages("inbox", 10, {
    hosts: [mailboxConfig.imapHost]
  });

  console.log("Inbox push check fetched messages", {
    messageCount: messages.length,
    lastSeenUid
  });

  if (!messages.length) {
    await stateRef.set({
      lastCheckedAt: FieldValue.serverTimestamp(),
      lastSeenUid
    }, { merge: true });
    return;
  }

  const latestMessage = messages[0];
  const latestUid = Number.parseInt(String(latestMessage.id || "0"), 10) || 0;

  console.log("Inbox push check latest message", {
    latestUid,
    lastSeenUid,
    latestSubject: String(latestMessage.subject || ""),
    latestFrom: String(latestMessage.from || "")
  });

  if (!lastSeenUid) {
    await stateRef.set({
      lastSeenUid: latestUid,
      lastCheckedAt: FieldValue.serverTimestamp(),
      initializedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log("Initialized inbox push notification baseline", { latestUid });
    return;
  }

  if (latestUid <= lastSeenUid) {
    console.log("No new inbox messages for push notification.", { latestUid, lastSeenUid });
    await stateRef.set({
      lastCheckedAt: FieldValue.serverTimestamp(),
      lastSeenUid
    }, { merge: true });
    return;
  }

  const newMessages = messages.filter((message) => {
    const uid = Number.parseInt(String(message.id || "0"), 10) || 0;
    return uid > lastSeenUid;
  });

  const notificationResult = await sendNewEmailNotification(latestMessage, newMessages.length || 1);
  console.log("Inbox push notification result", {
    latestUid,
    previousLastSeenUid: lastSeenUid,
    newMessageCount: newMessages.length || 1,
    notificationResult
  });

  await stateRef.set({
    lastSeenUid: latestUid,
    lastNotifiedUid: latestUid,
    lastNotificationResult: notificationResult,
    lastCheckedAt: FieldValue.serverTimestamp(),
    lastNotifiedAt: FieldValue.serverTimestamp()
  }, { merge: true });
});

function getSiteActionTitle(action) {
  const labels = {
    page_view: "Page view",
    click: "Site click",
    email_signup: "Email signup",
    video_play: "Video play",
    ticket_redirect_continue: "Ticket redirect",
    ticket_redirect_unavailable: "Ticket issue"
  };

  return labels[action] || "Site action";
}

function getSiteActionBody(data = {}) {
  const actionSubtype = String(data.actionSubtype || "").trim();
  const pageName = String(data.pageName || data.sourcePage || data.page || "").trim();
  const label = String(data.label || data.title || data.linkTitle || data.destinationLabel || "").trim();
  const source = [pageName, label, actionSubtype].filter(Boolean).join(" - ");
  return source.slice(0, 180) || "A tracked site action was recorded.";
}

exports.notifyOnSiteActionCreated = onDocumentCreated({
  region: "us-central1",
  document: "site-actions/{actionId}",
  maxInstances: 5
}, async (event) => {
  const data = event.data?.data() || {};
  const action = String(data.action || "").trim();

  if (!action) {
    return;
  }

  await sendAdminPushNotification({
    title: getSiteActionTitle(action),
    body: getSiteActionBody(data),
    tag: `hae-site-action-${action}-${event.params.actionId}`,
    data: {
      type: "site-action",
      action,
      actionId: event.params.actionId,
      actionSubtype: data.actionSubtype || "",
      pageName: data.pageName || data.sourcePage || data.page || ""
    },
    isEnabled: (settings) => Boolean(settings.siteActions?.[action])
  });
});

exports.notifyOnMailingListSignupCreated = onDocumentCreated({
  region: "us-central1",
  document: "mailing-list-signups/{signupId}",
  maxInstances: 5
}, async (event) => {
  const data = event.data?.data() || {};
  const email = String(data.email || event.params.signupId || "").trim();
  const source = String(data.sourcePage || data.source || "").trim();

  await sendAdminPushNotification({
    title: "Mailing list signup",
    body: [email, source].filter(Boolean).join(" - ").slice(0, 180) || "A new contact joined the mailing list.",
    tag: "hae-mailing-list-signup",
    data: {
      type: "mailing-list-signup",
      signupId: event.params.signupId,
      email,
      source
    },
    isEnabled: (settings) => Boolean(settings.mailingListSignups)
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
        attachments: normalizeParsedAttachments(parsed.attachments || []),
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
  const attachments = normalizeOutgoingAttachments(request.data?.attachments || []);

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
    attachments,
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
