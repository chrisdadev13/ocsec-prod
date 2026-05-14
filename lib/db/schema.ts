import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const scanStatusEnum = pgEnum("scan_status", [
  "pending", // scan row created, sandbox not started yet
  "cloning", // sandbox is cloning the repo
  "scanning", // deepsec is running
  "ingesting", // exported findings are being stored in DB
  "attacking", // agent is firing HTTP probes
  "completed", // done, report ready
  "failed", // something blew up
]);

export const scanModeEnum = pgEnum("scan_mode", [
  "blackbox", // URL only
  "greybox", // URL + repo (deepsec first, then targeted attacks)
]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const scan = pgTable(
  "scan",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // target
    targetUrl: text("target_url"),
    repoUrl: text("repo_url"), // null if blackbox
    mode: scanModeEnum("mode").notNull().default("blackbox"),

    // state machine
    status: scanStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),

    // full deepsec JSON blob — source of truth, never derive from findings table
    rawFindings: jsonb("raw_findings"),

    // LLM-generated scan synopsis for the overview tab
    overview: jsonb("overview"),
    overviewError: text("overview_error"),

    // denormalized from deepsec summary block — for fast dashboard rendering
    filesAnalyzed: integer("files_analyzed").default(0).notNull(),
    criticalCount: integer("critical_count").default(0).notNull(),
    highCount: integer("high_count").default(0).notNull(),
    mediumCount: integer("medium_count").default(0).notNull(),
    lowCount: integer("low_count").default(0).notNull(),

    // public share — /report/:shareToken, only works if isPublic = true
    isPublic: boolean("is_public").default(false).notNull(),
    shareToken: text("share_token").unique(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("scan_userId_idx").on(table.userId),
    index("scan_status_idx").on(table.status),
    index("scan_shareToken_idx").on(table.shareToken),
  ],
);

// ─── Finding ───────────────────────────────────────────────────────────────────
// One row per entry in files[].findings[] from the deepsec JSON.
// Severity is plain text because deepsec uses non-standard values like
// "HIGH_BUG" and "BUG" that don't map cleanly to a fixed enum.

export const finding = pgTable(
  "finding",
  {
    id: text("id").primaryKey(),
    scanId: text("scan_id")
      .notNull()
      .references(() => scan.id, { onDelete: "cascade" }),

    // straight from deepsec — no mapping, no transformation
    filePath: text("file_path").notNull(),
    severity: text("severity").notNull(), // "HIGH", "MEDIUM", "BUG", "HIGH_BUG"
    vulnSlug: text("vuln_slug").notNull(), // "secrets-exposure", "missing-auth"
    title: text("title").notNull(),
    description: text("description").notNull(),
    recommendation: text("recommendation"),
    lineNumbers: jsonb("line_numbers"), // [1, 2, 6]
    confidence: text("confidence"), // "high", "medium"

    // attack phase — all null until agent runs
    confirmed: boolean("confirmed").default(false).notNull(),
    attackPayload: text("attack_payload"), // exact curl / HTTP request fired
    attackResponse: text("attack_response"), // trimmed response proving the vuln
    attackExplanation: text("attack_explanation"), // agent's reasoning

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("finding_scanId_idx").on(table.scanId),
    index("finding_severity_idx").on(table.severity),
    index("finding_confirmed_idx").on(table.confirmed),
  ],
);

export const analysisHistory = pgTable(
  "analysis_history",
  {
    id: text("id").primaryKey(),
    scanId: text("scan_id")
      .notNull()
      .references(() => scan.id, { onDelete: "cascade" }),

    filePath: text("file_path").notNull(),
    runId: text("run_id").notNull(),
    investigatedAt: timestamp("investigated_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    phase: text("phase").notNull(),
    agentType: text("agent_type").notNull(),
    model: text("model").notNull(),
    modelConfig: jsonb("model_config").notNull(),
    agentSessionId: text("agent_session_id"),
    findingCount: integer("finding_count").notNull(),
    numTurns: integer("num_turns"),
    costUsd: text("cost_usd"),
    usage: jsonb("usage"),
    refusal: jsonb("refusal"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("analysis_history_scanId_idx").on(table.scanId),
    index("analysis_history_filePath_idx").on(table.filePath),
    index("analysis_history_runId_idx").on(table.runId),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  scans: many(scan),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const scanRelations = relations(scan, ({ one, many }) => ({
  user: one(user, { fields: [scan.userId], references: [user.id] }),
  findings: many(finding),
  analysisHistory: many(analysisHistory),
}));

export const findingRelations = relations(finding, ({ one }) => ({
  scan: one(scan, { fields: [finding.scanId], references: [scan.id] }),
}));

export const analysisHistoryRelations = relations(analysisHistory, ({ one }) => ({
  scan: one(scan, {
    fields: [analysisHistory.scanId],
    references: [scan.id],
  }),
}));
