"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// features/integrations/payment/manual.ts
var manual_exports = {};
__export(manual_exports, {
  capturePaymentFunction: () => capturePaymentFunction,
  createPaymentFunction: () => createPaymentFunction,
  getPaymentStatusFunction: () => getPaymentStatusFunction,
  handleWebhookFunction: () => handleWebhookFunction,
  refundPaymentFunction: () => refundPaymentFunction
});
async function createPaymentFunction({ trip, amount, currency, idempotencyKey }) {
  return { status: "pending", externalId: `manual:${trip.id}:${idempotencyKey || "unkeyed"}`, amount, currency, disclosure: "Manual adapter records an obligation; it does not authorize or move money." };
}
async function capturePaymentFunction({ paymentId, amount, currency }) {
  return { status: "pending", externalId: paymentId, amount, currency, disclosure: "Manual adapter cannot capture or claim receipt of funds." };
}
async function refundPaymentFunction({ paymentId, amount, currency }) {
  return { status: "processing", externalId: paymentId, amount, currency, disclosure: "Manual adapter cannot issue or claim a refund." };
}
async function getPaymentStatusFunction({ paymentId }) {
  return { status: "pending", externalId: paymentId, disclosure: "Manual adapter has no external payment status." };
}
async function handleWebhookFunction() {
  throw new Error("The manual adapter does not accept webhooks.");
}
var init_manual = __esm({
  "features/integrations/payment/manual.ts"() {
    "use strict";
  }
});

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/lib/s3-storage.ts
function s3ForcePathStyle(endpoint) {
  let hostname = "";
  try {
    hostname = endpoint ? new URL(endpoint).hostname : "";
  } catch {
  }
  return !(hostname === "storageapi.dev" || hostname.endsWith(".storageapi.dev"));
}

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core13 = require("@keystone-6/core");
var import_session = require("@keystone-6/core/session");
var import_config = require("dotenv/config");

// features/keystone/models/PaymentObservation.ts
var import_core = require("@keystone-6/core");
var import_fields2 = require("@keystone-6/core/fields");

// features/keystone/access.ts
var permissionNames = [
  "canAccessDashboard",
  "canManagePeople",
  "canManageRoles",
  "canManageFleet",
  "canDispatchRides",
  "canManageDrivers",
  "canManageFinance",
  "canManageSafety",
  "canManageIntegrations",
  "canManageOnboarding"
];
function humanSessionId(session2) {
  if (session2?.listKey !== "User" || typeof session2.itemId !== "string" || !session2.itemId) return null;
  if (["apiKeyId", "apiKeyScopes", "oauthScopes", "customerToken"].some((key) => Object.prototype.hasOwnProperty.call(session2, key)) || Object.prototype.hasOwnProperty.call(session2.data || {}, "machine")) return null;
  return session2.itemId;
}
async function currentHumanActor(db, session2) {
  const actorId = humanSessionId(session2);
  if (!actorId) return null;
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { id: true, roleId: true } });
  return actor?.id === actorId ? actor : null;
}
async function hasPermission(permission, { context, session: session2 }) {
  const actor = await currentHumanActor(context.prisma, session2);
  if (!actor?.roleId) return false;
  const role = await context.prisma.role.findFirst({
    where: { id: actor.roleId, [permission]: true, assignedTo: { some: { id: actor.id } } },
    select: { id: true }
  });
  return role?.id === actor.roleId;
}
var permissions = Object.fromEntries(permissionNames.map((name) => [name, (args) => hasPermission(name, args)]));
var isSignedIn = async ({ context, session: session2 }) => Boolean(await currentHumanActor(context.prisma, session2));
var isGlobalAdministrator = (args) => permissions.canManageRoles(args);
var membershipRoles = {
  operations: ["owner", "dispatcher"],
  drivers: ["owner", "dispatcher"],
  finance: ["owner", "finance"],
  safety: ["owner", "support"],
  fleetAdmin: ["owner"]
};
var fleetWhereByList = {
  Fleet: (ids) => ({ id: { in: ids } }),
  FleetMembership: (ids) => ({ fleet: { id: { in: ids } } }),
  FleetBrandingChange: (ids) => ({ fleet: { id: { in: ids } } }),
  DriverProfile: (ids) => ({ fleet: { id: { in: ids } } }),
  Vehicle: (ids) => ({ fleet: { id: { in: ids } } }),
  RiderProfile: (ids) => ({ homeFleet: { id: { in: ids } } }),
  ServiceArea: (ids) => ({ fleet: { id: { in: ids } } }),
  RideService: (ids) => ({ fleet: { id: { in: ids } } }),
  AvailabilityRule: (ids) => ({ driver: { fleet: { id: { in: ids } } } }),
  AvailabilityException: (ids) => ({ driver: { fleet: { id: { in: ids } } } }),
  FareRule: (ids) => ({ fleet: { id: { in: ids } } }),
  ComplianceDocument: (ids) => ({ OR: [
    { driver: { fleet: { id: { in: ids } } } },
    { vehicle: { fleet: { id: { in: ids } } } }
  ] }),
  Policy: (ids) => ({ fleet: { id: { in: ids } } }),
  PolicyEvaluation: (ids) => ({ OR: [
    { driver: { fleet: { id: { in: ids } } } },
    { vehicle: { fleet: { id: { in: ids } } } },
    { policy: { fleet: { id: { in: ids } } } }
  ] }),
  ProviderConnection: (ids) => ({ fleet: { id: { in: ids } } }),
  MarketplaceRegistration: (ids) => ({ fleet: { id: { in: ids } } }),
  Notification: (ids) => ({ trip: { fleet: { id: { in: ids } } } }),
  RideQuote: (ids) => ({ service: { fleet: { id: { in: ids } } } }),
  RideRequest: (ids) => ({ fleet: { id: { in: ids } } }),
  MatchOffer: (ids) => ({ OR: [
    { request: { fleet: { id: { in: ids } } } },
    { driver: { fleet: { id: { in: ids } } } }
  ] }),
  Trip: (ids) => ({ fleet: { id: { in: ids } } }),
  TripEvent: (ids) => ({ trip: { fleet: { id: { in: ids } } } }),
  LocationEvent: (ids) => ({ trip: { fleet: { id: { in: ids } } } }),
  Cancellation: (ids) => ({ trip: { fleet: { id: { in: ids } } } }),
  SafetyIncident: (ids) => ({ trip: { fleet: { id: { in: ids } } } }),
  SupportCase: (ids) => ({ trip: { fleet: { id: { in: ids } } } }),
  Conversation: (ids) => ({ trip: { fleet: { id: { in: ids } } } }),
  Message: (ids) => ({ conversation: { trip: { fleet: { id: { in: ids } } } } }),
  Review: (ids) => ({ trip: { fleet: { id: { in: ids } } } }),
  Payment: (ids) => ({ trip: { fleet: { id: { in: ids } } } }),
  Refund: (ids) => ({ payment: { trip: { fleet: { id: { in: ids } } } } }),
  PaymentObservation: (ids) => ({ payment: { trip: { fleet: { id: { in: ids } } } } }),
  LedgerEntry: (ids) => ({ OR: [
    { trip: { fleet: { id: { in: ids } } } },
    { payment: { trip: { fleet: { id: { in: ids } } } } },
    { payout: { driver: { fleet: { id: { in: ids } } } } }
  ] }),
  Payout: (ids) => ({ driver: { fleet: { id: { in: ids } } } })
};
function membershipWhere(actorId, capability) {
  return { userId: actorId, user: { is: { id: actorId } }, fleet: { isNot: null }, status: "active", role: { in: membershipRoles[capability] } };
}
async function fleetIdsFor(context, session2, capability) {
  const actor = await currentHumanActor(context.prisma, session2);
  if (!actor) return [];
  const ids = /* @__PURE__ */ new Set();
  let after;
  for (; ; ) {
    const memberships = await context.prisma.fleetMembership.findMany({
      where: { ...membershipWhere(actor.id, capability), ...after ? { id: { gt: after } } : {} },
      orderBy: { id: "asc" },
      take: 200,
      select: { id: true, fleetId: true }
    });
    for (const membership of memberships) if (membership.fleetId) ids.add(membership.fleetId);
    if (memberships.length < 200) return [...ids];
    const last = memberships[memberships.length - 1].id;
    if (last === after) throw new Error("Fleet authority continuation did not advance.");
    after = last;
  }
}
async function canAccessFleet(context, session2, fleetId, capability) {
  if (!fleetId || !humanSessionId(session2)) return false;
  const fleet = await context.prisma.fleet.findUnique({ where: { id: fleetId }, select: { id: true } });
  if (fleet?.id !== fleetId) return false;
  if (await isGlobalAdministrator({ context, session: session2 })) return true;
  const actor = await currentHumanActor(context.prisma, session2);
  if (!actor) return false;
  const membership = await context.prisma.fleetMembership.findFirst({
    where: { ...membershipWhere(actor.id, capability), fleetId },
    select: { id: true }
  });
  return Boolean(membership);
}
async function fleetScopeWhere({ context, session: session2, listKey }, capability) {
  if (!humanSessionId(session2)) return false;
  if (await isGlobalAdministrator({ context, session: session2 })) return true;
  const ids = await fleetIdsFor(context, session2, capability);
  if (!ids.length) return false;
  const filter = fleetWhereByList[listKey];
  return filter ? filter(ids) : false;
}
async function hasAnyFleetScope(context, session2, capability) {
  if (!humanSessionId(session2)) return false;
  if (await isGlobalAdministrator({ context, session: session2 })) return true;
  const actor = await currentHumanActor(context.prisma, session2);
  if (!actor) return false;
  return Boolean(await context.prisma.fleetMembership.findFirst({ where: membershipWhere(actor.id, capability), select: { id: true } }));
}
function fleetScopedAccess(capability) {
  return {
    operation: {
      query: ({ context, session: session2 }) => hasAnyFleetScope(context, session2, capability),
      // Tenant relationships are immutable at the field boundary. Generic
      // creates cannot establish a legitimate parent; semantic setup owns them.
      create: () => false,
      update: ({ context, session: session2 }) => hasAnyFleetScope(context, session2, capability),
      // Mutable parents are archived/paused, never severed from history by CRUD.
      delete: () => false
    },
    filter: {
      query: (args) => fleetScopeWhere(args, capability),
      update: (args) => fleetScopeWhere(args, capability),
      delete: (args) => fleetScopeWhere(args, "fleetAdmin")
    }
  };
}
var operatorAccess = fleetScopedAccess("operations");
function lockedFleetAccess(capability) {
  return {
    ...fleetScopedAccess(capability),
    operation: { query: ({ context, session: session2 }) => hasAnyFleetScope(context, session2, capability), create: () => false, update: () => false, delete: () => false }
  };
}
var lockedOperationalAccess = lockedFleetAccess("operations");
var financeAccess = {
  ...fleetScopedAccess("finance"),
  operation: { query: ({ context, session: session2 }) => hasAnyFleetScope(context, session2, "finance"), create: () => false, update: () => false, delete: () => false }
};
var safetyAccess = fleetScopedAccess("safety");

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({ defaultValue: { kind: "now" }, isIndexed: true }),
  updatedAt: (0, import_fields.timestamp)({ db: { updatedAt: true }, isIndexed: true })
};

// features/keystone/models/PaymentObservation.ts
var PaymentObservation = (0, import_core.list)({
  access: financeAccess,
  fields: {
    payment: (0, import_fields2.relationship)({ ref: "Payment", access: { create: () => false, update: () => false } }),
    refund: (0, import_fields2.relationship)({ ref: "Refund", access: { create: () => false, update: () => false } }),
    observationKey: (0, import_fields2.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    details: (0, import_fields2.json)({ defaultValue: {} }),
    ...trackingFields
  }
});

// features/keystone/models/RequestCancellationCommand.ts
var import_core2 = require("@keystone-6/core");
var import_fields3 = require("@keystone-6/core/fields");
var RequestCancellationCommand = (0, import_core2.list)({
  access: { operation: { query: () => false, create: () => false, update: () => false, delete: () => false } },
  fields: {
    request: (0, import_fields3.relationship)({ ref: "RideRequest", access: { create: () => false, update: () => false } }),
    idempotencyKey: (0, import_fields3.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    command: (0, import_fields3.json)({ defaultValue: {} }),
    result: (0, import_fields3.json)({ defaultValue: {} }),
    ...trackingFields
  }
});

// features/keystone/models/FleetBrandingChange.ts
var import_core3 = require("@keystone-6/core");
var import_fields4 = require("@keystone-6/core/fields");
var FleetBrandingChange = (0, import_core3.list)({
  access: lockedFleetAccess("fleetAdmin"),
  fields: {
    fleet: (0, import_fields4.relationship)({ ref: "Fleet", access: { create: () => false, update: () => false } }),
    actor: (0, import_fields4.relationship)({ ref: "User", access: { create: () => false, update: () => false } }),
    idempotencyKey: (0, import_fields4.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    command: (0, import_fields4.json)({ defaultValue: {} }),
    result: (0, import_fields4.json)({ defaultValue: {} }),
    ...trackingFields
  }
});

// features/keystone/models/User.ts
var import_core4 = require("@keystone-6/core");
var import_access3 = require("@keystone-6/core/access");
var import_fields5 = require("@keystone-6/core/fields");
var selfOrPeople = async (args) => await permissions.canManagePeople(args) || (await isSignedIn(args) ? { id: { equals: args.session.itemId } } : false);
var selfField = async (args) => await permissions.canManagePeople(args) || await isSignedIn(args) && args.session.itemId === String(args.item.id);
async function firstUserAdminRole(context) {
  if (await context.prisma.user.count() > 0) return null;
  const grants = Object.fromEntries(permissionNames.map((name) => [name, true]));
  await context.prisma.role.upsert({ where: { name: "Admin" }, create: { name: "Admin", ...grants }, update: grants, select: { id: true } });
  const role = await context.prisma.role.findUnique({ where: { name: "Admin" }, select: { id: true } });
  if (!role?.id) throw new Error("The Admin role could not be created.");
  return role.id;
}
var User = (0, import_core4.list)({
  hooks: {
    resolveInput: async ({ operation, resolvedData, context }) => {
      if (operation !== "create" || resolvedData.role) return resolvedData;
      const roleId = await firstUserAdminRole(context);
      return roleId ? { ...resolvedData, role: { connect: { id: roleId } } } : resolvedData;
    }
  },
  access: {
    operation: { query: isSignedIn, create: (args) => process.env.PUBLIC_SIGNUPS_ALLOWED === "true" || permissions.canManagePeople(args), update: isSignedIn, delete: import_access3.denyAll },
    filter: { query: selfOrPeople, update: selfOrPeople }
  },
  fields: {
    name: (0, import_fields5.text)({ validation: { isRequired: true } }),
    email: (0, import_fields5.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    password: (0, import_fields5.password)({ validation: { isRequired: true, length: { min: 10 } }, access: { read: import_access3.denyAll } }),
    phone: (0, import_fields5.text)({ access: { read: selfField, update: selfField } }),
    role: (0, import_fields5.relationship)({ ref: "Role.assignedTo", access: { create: permissions.canManageRoles, update: permissions.canManageRoles } }),
    onboardingStatus: (0, import_fields5.select)({ options: [
      { label: "Not started", value: "not_started" },
      { label: "In progress", value: "in_progress" },
      { label: "Completed", value: "completed" },
      { label: "Dismissed", value: "dismissed" }
    ], defaultValue: "not_started", access: { create: () => false, update: () => false } }),
    fleetMemberships: (0, import_fields5.relationship)({ ref: "FleetMembership.user", many: true, access: { create: () => false, update: () => false } }),
    driverProfile: (0, import_fields5.relationship)({ ref: "DriverProfile.user", access: { create: () => false, update: () => false } }),
    riderProfile: (0, import_fields5.relationship)({ ref: "RiderProfile.user", access: { create: () => false, update: () => false } }),
    requestedRides: (0, import_fields5.relationship)({ ref: "RideRequest.rider", many: true, access: { create: () => false, update: () => false } }),
    trips: (0, import_fields5.relationship)({ ref: "Trip.rider", many: true, access: { create: () => false, update: () => false } }),
    reviews: (0, import_fields5.relationship)({ ref: "Review.author", many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});

// features/keystone/models/Role.ts
var import_core5 = require("@keystone-6/core");
var import_fields6 = require("@keystone-6/core/fields");
var Role = (0, import_core5.list)({
  access: { operation: { query: isSignedIn, create: permissions.canManageRoles, update: permissions.canManageRoles, delete: permissions.canManageRoles } },
  fields: {
    name: (0, import_fields6.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    ...Object.fromEntries(permissionNames.map((name) => [name, (0, import_fields6.checkbox)({ defaultValue: false })])),
    assignedTo: (0, import_fields6.relationship)({ ref: "User.role", many: true, access: { create: permissions.canManageRoles, update: permissions.canManageRoles } }),
    ...trackingFields
  }
});

// features/keystone/models/Identity.ts
var import_core6 = require("@keystone-6/core");
var import_fields7 = require("@keystone-6/core/fields");

// features/platform/settings/branding/store-logo.ts
var DEFAULT_STORE_LOGO_ICON = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="100%" width="100%" viewBox="0 0 42 48"><path fill="#155eef" fill-rule="evenodd" d="m22.102 20.86 9.9-9.9L29.88 8.84l-7.339 7.339V3h-3v13.178l-7.339-7.34-2.121 2.122 9.9 9.9 1.06 1.06zm2.12 2.121 9.9-9.9 2.121 2.122-7.339 7.339H42v3H28.904l7.34 7.339L34.121 35l-9.9-9.899-1.06-1.06zM7.96 35.001l9.9-9.899 1.06-1.06-1.06-1.061-9.9-9.9-2.121 2.122 7.339 7.339H.002v3h13.176l-7.34 7.339zm12.02-7.777-9.9 9.9 2.122 2.12 7.339-7.338V45h3V31.906l7.339 7.338L32 37.124l-9.9-9.9-1.06-1.061z" clip-rule="evenodd"/></svg>';
var DEFAULT_STORE_LOGO_COLOR = "0";
function normalizeStoreLogoColor(value) {
  const numeric = Number.parseFloat(String(value ?? DEFAULT_STORE_LOGO_COLOR));
  if (!Number.isFinite(numeric)) return DEFAULT_STORE_LOGO_COLOR;
  return String((numeric % 360 + 360) % 360);
}

// features/keystone/utils/storeLogo.ts
var ALLOWED_ELEMENTS = /* @__PURE__ */ new Set([
  "svg",
  "g",
  "path",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "title",
  "desc"
]);
var ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set([
  "xmlns",
  "fill",
  "fill-rule",
  "clip-rule",
  "height",
  "width",
  "viewbox",
  "d",
  "clip-path",
  "id",
  "x1",
  "x2",
  "y1",
  "y2",
  "gradientunits",
  "gradienttransform",
  "offset",
  "stop-color",
  "stop-opacity",
  "opacity",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "transform",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "points",
  "role",
  "aria-hidden",
  "aria-label",
  "preserveaspectratio"
]);
var ATTRIBUTE_PATTERN = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;
var TAG_PATTERN = /<\/?\s*([A-Za-z][\w:-]*)([^<>]*)>/g;
function sanitizeStoreLogoSvg(svg) {
  const source = svg.trim();
  if (!source.startsWith("<svg") || !source.endsWith("</svg>") || source.length > 1e5) {
    return "";
  }
  if (/&|<!|<\?|\b(?:javascript|data|vbscript):|\bon[a-z]+\s*=|\b(?:href|src|style)\s*=/i.test(source)) {
    return "";
  }
  let tagCount = 0;
  const stack = [];
  let roots = 0;
  let match;
  TAG_PATTERN.lastIndex = 0;
  while (match = TAG_PATTERN.exec(source)) {
    tagCount += 1;
    const element = match[1].toLowerCase();
    if (!ALLOWED_ELEMENTS.has(element)) return "";
    if (match[0].startsWith("</")) {
      if (match[2].trim() || stack.pop() !== element) return "";
      continue;
    }
    if (!stack.length) {
      if (element !== "svg" || ++roots !== 1) return "";
    }
    if (!/\/\s*>$/.test(match[0])) stack.push(element);
    const attributes = match[2];
    let consumed = "";
    const attributesSeen = /* @__PURE__ */ new Set();
    ATTRIBUTE_PATTERN.lastIndex = 0;
    let attributeMatch;
    while (attributeMatch = ATTRIBUTE_PATTERN.exec(attributes)) {
      consumed += attributeMatch[0];
      const attribute = attributeMatch[1].toLowerCase();
      const value = attributeMatch[2].slice(1, -1);
      if (attributesSeen.has(attribute)) return "";
      attributesSeen.add(attribute);
      if (attribute === "xmlns" && value !== "http://www.w3.org/2000/svg") return "";
      if (!ALLOWED_ATTRIBUTES.has(attribute)) return "";
      if (attribute === "id" && !/^[A-Za-z_][\w:.-]*$/.test(value)) return "";
      if (/url\(/i.test(value) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(value)) return "";
    }
    const remainder = attributes.replace(consumed, "").replace(/\//g, "").trim();
    if (remainder) return "";
  }
  TAG_PATTERN.lastIndex = 0;
  if (tagCount === 0 || stack.length || roots !== 1 || source.replace(TAG_PATTERN, "").trim()) return "";
  return source;
}

// features/keystone/models/Identity.ts
var Fleet = (0, import_core6.list)({
  access: fleetScopedAccess("fleetAdmin"),
  fields: {
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    slug: (0, import_fields7.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    status: (0, import_fields7.select)({ options: [{ label: "Setup", value: "setup" }, { label: "Active", value: "active" }, { label: "Paused", value: "paused" }], defaultValue: "setup" }),
    publicDescription: (0, import_fields7.text)({ ui: { displayMode: "textarea" } }),
    publicCity: (0, import_fields7.text)(),
    countryCode: (0, import_fields7.text)({ defaultValue: "US" }),
    currencyCode: (0, import_fields7.text)({ defaultValue: "USD" }),
    timezone: (0, import_fields7.text)({ defaultValue: "UTC" }),
    supportEmail: (0, import_fields7.text)(),
    supportPhone: (0, import_fields7.text)(),
    logoIcon: (0, import_fields7.text)({ defaultValue: DEFAULT_STORE_LOGO_ICON, hooks: {
      resolveInput: ({ resolvedData, fieldKey }) => {
        const value = resolvedData[fieldKey];
        return value === void 0 || value === null || value === "" ? value : typeof value === "string" ? sanitizeStoreLogoSvg(value) : "";
      },
      validate: ({ inputData, resolvedData, fieldKey, addValidationError }) => {
        if (typeof inputData?.[fieldKey] === "string" && inputData[fieldKey].trim() && !resolvedData?.[fieldKey]) addValidationError("Logo must be a safe SVG document.");
      }
    } }),
    logoColor: (0, import_fields7.text)({ defaultValue: DEFAULT_STORE_LOGO_COLOR, hooks: { resolveInput: ({ resolvedData, fieldKey }) => resolvedData[fieldKey] === void 0 ? void 0 : normalizeStoreLogoColor(resolvedData[fieldKey]) } }),
    operationsMode: (0, import_fields7.select)({ options: [{ label: "Off", value: "off" }, { label: "Manual dispatch", value: "manual" }], defaultValue: "off", validation: { isRequired: true } }),
    preciseLocationRetentionDays: (0, import_fields7.text)({ defaultValue: "30" }),
    memberships: (0, import_fields7.relationship)({ ref: "FleetMembership.fleet", many: true, access: { create: () => false, update: () => false } }),
    drivers: (0, import_fields7.relationship)({ ref: "DriverProfile.fleet", many: true, access: { create: () => false, update: () => false } }),
    riders: (0, import_fields7.relationship)({ ref: "RiderProfile.homeFleet", many: true, access: { create: () => false, update: () => false } }),
    vehicles: (0, import_fields7.relationship)({ ref: "Vehicle.fleet", many: true, access: { create: () => false, update: () => false } }),
    serviceAreas: (0, import_fields7.relationship)({ ref: "ServiceArea.fleet", many: true, access: { create: () => false, update: () => false } }),
    services: (0, import_fields7.relationship)({ ref: "RideService.fleet", many: true, access: { create: () => false, update: () => false } }),
    fareRules: (0, import_fields7.relationship)({ ref: "FareRule.fleet", many: true, access: { create: () => false, update: () => false } }),
    rides: (0, import_fields7.relationship)({ ref: "RideRequest.fleet", many: true, access: { create: () => false, update: () => false } }),
    trips: (0, import_fields7.relationship)({ ref: "Trip.fleet", many: true, access: { create: () => false, update: () => false } }),
    policies: (0, import_fields7.relationship)({ ref: "Policy.fleet", many: true, access: { create: () => false, update: () => false } }),
    providers: (0, import_fields7.relationship)({ ref: "ProviderConnection.fleet", many: true, access: { create: () => false, update: () => false } }),
    marketplaceRegistration: (0, import_fields7.relationship)({ ref: "MarketplaceRegistration.fleet", access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var FleetMembership = (0, import_core6.list)({
  access: lockedOperationalAccess,
  fields: {
    fleet: (0, import_fields7.relationship)({ ref: "Fleet.memberships", access: { create: () => false, update: () => false } }),
    user: (0, import_fields7.relationship)({ ref: "User.fleetMemberships", access: { create: () => false, update: () => false } }),
    role: (0, import_fields7.select)({ options: ["owner", "dispatcher", "support", "finance", "viewer"].map((value) => ({ label: value, value })), defaultValue: "viewer" }),
    status: (0, import_fields7.select)({ options: ["invited", "active", "suspended"].map((value) => ({ label: value, value })), defaultValue: "invited" }),
    invitedAt: (0, import_fields7.timestamp)(),
    acceptedAt: (0, import_fields7.timestamp)(),
    ...trackingFields
  }
});
var DriverProfile = (0, import_core6.list)({
  access: fleetScopedAccess("drivers"),
  fields: {
    user: (0, import_fields7.relationship)({ ref: "User.driverProfile", access: { create: () => false, update: () => false } }),
    fleet: (0, import_fields7.relationship)({ ref: "Fleet.drivers", access: { create: () => false, update: () => false } }),
    publicName: (0, import_fields7.text)({ validation: { isRequired: true } }),
    publicBio: (0, import_fields7.text)({ ui: { displayMode: "textarea" } }),
    publicPhotoUrl: (0, import_fields7.text)(),
    status: (0, import_fields7.select)({ options: ["applicant", "pending_review", "active", "paused", "ineligible", "offboarded"].map((value) => ({ label: value, value })), defaultValue: "applicant", access: { create: () => false, update: () => false } }),
    dispatchStatus: (0, import_fields7.select)({ options: ["offline", "available", "offered", "assigned", "on_trip"].map((value) => ({ label: value, value })), defaultValue: "offline", access: { create: () => false, update: () => false } }),
    acceptsScheduled: (0, import_fields7.checkbox)({ defaultValue: true }),
    languages: (0, import_fields7.json)({ defaultValue: [] }),
    accessibilityTrainingEvidence: (0, import_fields7.text)(),
    documents: (0, import_fields7.relationship)({ ref: "ComplianceDocument.driver", many: true, access: { create: () => false, update: () => false } }),
    vehicles: (0, import_fields7.relationship)({ ref: "Vehicle.drivers", many: true, access: { create: () => false, update: () => false } }),
    availabilityRules: (0, import_fields7.relationship)({ ref: "AvailabilityRule.driver", many: true, access: { create: () => false, update: () => false } }),
    availabilityExceptions: (0, import_fields7.relationship)({ ref: "AvailabilityException.driver", many: true, access: { create: () => false, update: () => false } }),
    policyEvaluations: (0, import_fields7.relationship)({ ref: "PolicyEvaluation.driver", many: true, access: { create: () => false, update: () => false } }),
    matchOffers: (0, import_fields7.relationship)({ ref: "MatchOffer.driver", many: true, access: { create: () => false, update: () => false } }),
    trips: (0, import_fields7.relationship)({ ref: "Trip.driver", many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var RiderProfile = (0, import_core6.list)({
  access: fleetScopedAccess("safety"),
  fields: {
    user: (0, import_fields7.relationship)({ ref: "User.riderProfile", access: { create: () => false, update: () => false } }),
    homeFleet: (0, import_fields7.relationship)({ ref: "Fleet.riders", access: { create: () => false, update: () => false } }),
    displayName: (0, import_fields7.text)({ validation: { isRequired: true } }),
    savedPlaces: (0, import_fields7.json)({ defaultValue: [], access: { read: permissions.canManagePeople, update: permissions.canManagePeople } }),
    accessibilityPreferences: (0, import_fields7.json)({ defaultValue: {} }),
    communicationPreferences: (0, import_fields7.json)({ defaultValue: {} }),
    emergencyContactEncryptedRef: (0, import_fields7.text)({ access: { read: permissions.canManageSafety, update: permissions.canManageSafety } }),
    ...trackingFields
  }
});

// features/keystone/models/Operations.ts
var import_core7 = require("@keystone-6/core");
var import_access7 = require("@keystone-6/core/access");
var import_fields8 = require("@keystone-6/core/fields");
var documentAccess = lockedFleetAccess("drivers");
var Vehicle = (0, import_core7.list)({
  access: operatorAccess,
  fields: {
    fleet: (0, import_fields8.relationship)({ ref: "Fleet.vehicles", access: { create: () => false, update: () => false } }),
    drivers: (0, import_fields8.relationship)({ ref: "DriverProfile.vehicles", many: true, access: { create: () => false, update: () => false } }),
    label: (0, import_fields8.text)({ validation: { isRequired: true } }),
    make: (0, import_fields8.text)(),
    model: (0, import_fields8.text)(),
    year: (0, import_fields8.integer)(),
    color: (0, import_fields8.text)(),
    plateMasked: (0, import_fields8.text)(),
    plateEncryptedRef: (0, import_fields8.text)({ access: { read: import_access7.denyAll, create: permissions.canManageDrivers, update: permissions.canManageDrivers } }),
    vinEncryptedRef: (0, import_fields8.text)({ access: { read: import_access7.denyAll, create: permissions.canManageDrivers, update: permissions.canManageDrivers } }),
    capacity: (0, import_fields8.integer)({ defaultValue: 4, validation: { min: 1, max: 50 } }),
    wheelchairAccessible: (0, import_fields8.checkbox)({ defaultValue: false }),
    status: (0, import_fields8.select)({ options: ["pending_review", "active", "maintenance", "suspended", "retired"].map((value) => ({ label: value, value })), defaultValue: "pending_review", access: { create: () => false, update: () => false } }),
    documents: (0, import_fields8.relationship)({ ref: "ComplianceDocument.vehicle", many: true, access: { create: () => false, update: () => false } }),
    policyEvaluations: (0, import_fields8.relationship)({ ref: "PolicyEvaluation.vehicle", many: true, access: { create: () => false, update: () => false } }),
    trips: (0, import_fields8.relationship)({ ref: "Trip.vehicle", many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var ComplianceDocument = (0, import_core7.list)({
  access: documentAccess,
  fields: {
    driver: (0, import_fields8.relationship)({ ref: "DriverProfile.documents", access: { create: () => false, update: () => false } }),
    vehicle: (0, import_fields8.relationship)({ ref: "Vehicle.documents", access: { create: () => false, update: () => false } }),
    kind: (0, import_fields8.select)({ options: ["driver_license", "vehicle_registration", "insurance", "inspection", "background_check", "business_license", "other"].map((value) => ({ label: value, value })) }),
    status: (0, import_fields8.select)({ options: ["submitted", "under_review", "accepted_evidence", "rejected_evidence", "expired", "revoked"].map((value) => ({ label: value, value })), defaultValue: "submitted" }),
    issuer: (0, import_fields8.text)(),
    referenceMasked: (0, import_fields8.text)(),
    secureFileRef: (0, import_fields8.text)({ access: { read: import_access7.denyAll, create: permissions.canManageDrivers, update: permissions.canManageDrivers } }),
    issuedAt: (0, import_fields8.timestamp)(),
    expiresAt: (0, import_fields8.timestamp)(),
    reviewedAt: (0, import_fields8.timestamp)(),
    reviewer: (0, import_fields8.relationship)({ ref: "User" }),
    reviewNotes: (0, import_fields8.text)({ ui: { displayMode: "textarea" } }),
    evidenceMetadata: (0, import_fields8.json)({ defaultValue: {}, access: { read: permissions.canManageDrivers, update: permissions.canManageDrivers } }),
    ...trackingFields
  }
});
var Policy = (0, import_core7.list)({
  access: fleetScopedAccess("fleetAdmin"),
  fields: {
    fleet: (0, import_fields8.relationship)({ ref: "Fleet.policies", access: { create: () => false, update: () => false } }),
    name: (0, import_fields8.text)({ validation: { isRequired: true } }),
    version: (0, import_fields8.text)({ validation: { isRequired: true } }),
    jurisdiction: (0, import_fields8.text)(),
    kind: (0, import_fields8.select)({ options: ["driver_eligibility", "vehicle_eligibility", "insurance", "licensing", "background_check", "location_retention", "pricing", "cancellation"].map((value) => ({ label: value, value })) }),
    status: (0, import_fields8.select)({ options: ["draft", "active", "retired"].map((value) => ({ label: value, value })), defaultValue: "draft" }),
    requirements: (0, import_fields8.json)({ defaultValue: {} }),
    evidenceSources: (0, import_fields8.json)({ defaultValue: [] }),
    disclaimer: (0, import_fields8.text)({ defaultValue: "Evidence recording is not legal approval or a compliance certification.", ui: { displayMode: "textarea" } }),
    evaluations: (0, import_fields8.relationship)({ ref: "PolicyEvaluation.policy", many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var PolicyEvaluation = (0, import_core7.list)({
  access: lockedFleetAccess("drivers"),
  fields: {
    policy: (0, import_fields8.relationship)({ ref: "Policy.evaluations" }),
    driver: (0, import_fields8.relationship)({ ref: "DriverProfile.policyEvaluations" }),
    vehicle: (0, import_fields8.relationship)({ ref: "Vehicle.policyEvaluations" }),
    outcome: (0, import_fields8.select)({ options: ["pending", "eligible", "ineligible", "manual_review"].map((value) => ({ label: value, value })), defaultValue: "pending" }),
    reasons: (0, import_fields8.json)({ defaultValue: [] }),
    evidenceSnapshot: (0, import_fields8.json)({ defaultValue: [] }),
    evaluatedAt: (0, import_fields8.timestamp)(),
    expiresAt: (0, import_fields8.timestamp)(),
    evaluator: (0, import_fields8.relationship)({ ref: "User" }),
    ...trackingFields
  }
});
var ProviderConnection = (0, import_core7.list)({
  access: fleetScopedAccess("fleetAdmin"),
  fields: {
    fleet: (0, import_fields8.relationship)({ ref: "Fleet.providers", access: { create: () => false, update: () => false } }),
    name: (0, import_fields8.text)({ validation: { isRequired: true } }),
    kind: (0, import_fields8.select)({ options: ["mapping", "payment", "communications", "identity", "background_check", "location", "notification"].map((value) => ({ label: value, value })) }),
    adapter: (0, import_fields8.text)({ validation: { isRequired: true } }),
    status: (0, import_fields8.select)({ options: ["unconfigured", "sandbox", "active", "disabled"].map((value) => ({ label: value, value })), defaultValue: "unconfigured" }),
    config: (0, import_fields8.json)({ defaultValue: {} }),
    secretReference: (0, import_fields8.text)({ access: { read: import_access7.denyAll } }),
    evidencePolicyUrl: (0, import_fields8.text)(),
    lastVerifiedAt: (0, import_fields8.timestamp)(),
    capabilities: (0, import_fields8.json)({ defaultValue: [] }),
    ...trackingFields
  }
});

// features/keystone/models/Service.ts
var import_core8 = require("@keystone-6/core");
var import_access9 = require("@keystone-6/core/access");
var import_fields9 = require("@keystone-6/core/fields");

// features/lib/currency.ts
function currencyDigits(code) {
  if (typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) throw new Error("Invalid currency.");
  const supported = Intl.supportedValuesOf?.("currency");
  if (supported && !supported.includes(code)) throw new Error("Unsupported currency.");
  return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
}
var MAX_MINOR = 2147483647;
function validMinor(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_MINOR;
}

// features/keystone/domain/fare.ts
function validateFareRule(rule) {
  currencyDigits(rule.currencyCode);
  for (const key of ["baseFareMinor", "perDistanceUnitMinor", "perMinuteMinor", "bookingFeeMinor", "minimumFareMinor", "cancellationFeeMinor", "noShowFeeMinor"]) {
    if ((rule[key] !== void 0 || !["cancellationFeeMinor", "noShowFeeMinor"].includes(key)) && !validMinor(rule[key])) throw new Error("Fare components must be non-negative integer minor units within the supported range.");
  }
  if (!["mile", "kilometer"].includes(rule.distanceUnit)) throw new Error("Unsupported distance unit.");
  if (rule.version !== void 0 && (!Number.isSafeInteger(rule.version) || rule.version < 1)) throw new Error("Fare version must be positive.");
  const maximum = rule.maximumMultiplierBasisPoints ?? 1e4;
  const multiplier = rule.multiplierBasisPoints ?? 1e4;
  if (![maximum, multiplier].every((value) => Number.isSafeInteger(value) && value >= 1e4 && value <= 3e4) || multiplier > maximum) throw new Error("Invalid fare multiplier.");
}
function calculateFare(rule, distanceMeters, durationSeconds) {
  validateFareRule(rule);
  if (!Number.isSafeInteger(distanceMeters) || distanceMeters < 0 || distanceMeters > MAX_MINOR || !Number.isSafeInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > MAX_MINOR) throw new Error("Route estimates must be non-negative supported integers.");
  const divisor = rule.distanceUnit === "mile" ? 1609.344 : 1e3;
  const distanceMinor = Math.round(distanceMeters / divisor * rule.perDistanceUnitMinor);
  const durationMinor = Math.round(durationSeconds / 60 * rule.perMinuteMinor);
  const subtotalMinor = rule.baseFareMinor + distanceMinor + durationMinor + rule.bookingFeeMinor;
  const multiplier = rule.multiplierBasisPoints ?? 1e4;
  const totalMinor = Math.max(rule.minimumFareMinor, Math.round(subtotalMinor * multiplier / 1e4));
  if (![distanceMinor, durationMinor, subtotalMinor, totalMinor].every(validMinor) || !Number.isSafeInteger(subtotalMinor * multiplier)) throw new Error("Calculated fare exceeds the supported range.");
  return { currencyCode: rule.currencyCode, baseFareMinor: rule.baseFareMinor, distanceMinor, durationMinor, bookingFeeMinor: rule.bookingFeeMinor, multiplierBasisPoints: multiplier, subtotalMinor, totalMinor };
}

// features/keystone/models/Service.ts
var ServiceArea = (0, import_core8.list)({
  access: operatorAccess,
  fields: {
    fleet: (0, import_fields9.relationship)({ ref: "Fleet.serviceAreas", access: { create: () => false, update: () => false } }),
    name: (0, import_fields9.text)({ validation: { isRequired: true } }),
    publicRegionLabel: (0, import_fields9.text)({ validation: { isRequired: true } }),
    countryCode: (0, import_fields9.text)({ defaultValue: "US" }),
    status: (0, import_fields9.select)({ options: ["draft", "active", "paused"].map((value) => ({ label: value, value })), defaultValue: "draft" }),
    coarseBounds: (0, import_fields9.json)({ defaultValue: {} }),
    providerGeometryRef: (0, import_fields9.text)({ access: { read: import_access9.denyAll, create: permissions.canManageFleet, update: permissions.canManageFleet } }),
    services: (0, import_fields9.relationship)({ ref: "RideService.serviceAreas", many: true, access: { create: () => false, update: () => false } }),
    fareRules: (0, import_fields9.relationship)({ ref: "FareRule.serviceArea", many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var RideService = (0, import_core8.list)({
  access: operatorAccess,
  fields: {
    fleet: (0, import_fields9.relationship)({ ref: "Fleet.services", access: { create: () => false, update: () => false } }),
    name: (0, import_fields9.text)({ validation: { isRequired: true } }),
    slug: (0, import_fields9.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    description: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    status: (0, import_fields9.select)({ options: ["draft", "active", "paused"].map((value) => ({ label: value, value })), defaultValue: "draft" }),
    category: (0, import_fields9.select)({ options: ["standard", "comfort", "xl", "accessible", "pet_friendly", "scheduled"].map((value) => ({ label: value, value })), defaultValue: "standard" }),
    passengerCapacity: (0, import_fields9.integer)({ defaultValue: 4, validation: { min: 1, max: 50 } }),
    wheelchairAccessible: (0, import_fields9.checkbox)({ defaultValue: false }),
    advanceBookingMinutes: (0, import_fields9.integer)({ defaultValue: 0 }),
    serviceAreas: (0, import_fields9.relationship)({ ref: "ServiceArea.services", many: true, access: { create: () => false, update: () => false } }),
    fareRules: (0, import_fields9.relationship)({ ref: "FareRule.service", many: true, access: { create: () => false, update: () => false } }),
    quotes: (0, import_fields9.relationship)({ ref: "RideQuote.service", many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var AvailabilityRule = (0, import_core8.list)({
  access: lockedOperationalAccess,
  fields: {
    driver: (0, import_fields9.relationship)({ ref: "DriverProfile.availabilityRules" }),
    dayOfWeek: (0, import_fields9.integer)({ validation: { min: 0, max: 6 } }),
    startTime: (0, import_fields9.text)(),
    endTime: (0, import_fields9.text)(),
    timezone: (0, import_fields9.text)({ defaultValue: "UTC" }),
    effectiveFrom: (0, import_fields9.timestamp)(),
    effectiveUntil: (0, import_fields9.timestamp)(),
    status: (0, import_fields9.select)({ options: ["active", "paused"].map((value) => ({ label: value, value })), defaultValue: "active" }),
    ...trackingFields
  }
});
var AvailabilityException = (0, import_core8.list)({
  access: lockedOperationalAccess,
  fields: {
    driver: (0, import_fields9.relationship)({ ref: "DriverProfile.availabilityExceptions" }),
    startsAt: (0, import_fields9.timestamp)({ validation: { isRequired: true } }),
    endsAt: (0, import_fields9.timestamp)({ validation: { isRequired: true } }),
    kind: (0, import_fields9.select)({ options: ["available", "blocked"].map((value) => ({ label: value, value })), defaultValue: "blocked" }),
    reason: (0, import_fields9.text)(),
    ...trackingFields
  }
});
var FareRule = (0, import_core8.list)({
  access: fleetScopedAccess("fleetAdmin"),
  hooks: { validateInput: ({ resolvedData, item, addValidationError }) => {
    try {
      validateFareRule({ ...item, ...resolvedData });
    } catch {
      addValidationError("Check the fare currency, version, multiplier and non-negative minor-unit amounts.");
    }
  } },
  fields: {
    fleet: (0, import_fields9.relationship)({ ref: "Fleet.fareRules", access: { create: () => false, update: () => false } }),
    service: (0, import_fields9.relationship)({ ref: "RideService.fareRules", access: { create: () => false, update: () => false } }),
    serviceArea: (0, import_fields9.relationship)({ ref: "ServiceArea.fareRules", access: { create: () => false, update: () => false } }),
    name: (0, import_fields9.text)({ validation: { isRequired: true } }),
    version: (0, import_fields9.integer)({ defaultValue: 1 }),
    status: (0, import_fields9.select)({ options: ["draft", "active", "retired"].map((value) => ({ label: value, value })), defaultValue: "draft" }),
    currencyCode: (0, import_fields9.text)({ defaultValue: "USD" }),
    baseFareMinor: (0, import_fields9.integer)({ defaultValue: 0 }),
    perDistanceUnitMinor: (0, import_fields9.integer)({ defaultValue: 0 }),
    distanceUnit: (0, import_fields9.select)({ options: ["kilometer", "mile"].map((value) => ({ label: value, value })), defaultValue: "mile" }),
    perMinuteMinor: (0, import_fields9.integer)({ defaultValue: 0 }),
    bookingFeeMinor: (0, import_fields9.integer)({ defaultValue: 0 }),
    minimumFareMinor: (0, import_fields9.integer)({ defaultValue: 0 }),
    cancellationFeeMinor: (0, import_fields9.integer)({ defaultValue: 0 }),
    noShowFeeMinor: (0, import_fields9.integer)({ defaultValue: 0 }),
    maximumMultiplierBasisPoints: (0, import_fields9.integer)({ defaultValue: 1e4, validation: { min: 1e4, max: 3e4 } }),
    rules: (0, import_fields9.json)({ defaultValue: {} }),
    quotes: (0, import_fields9.relationship)({ ref: "RideQuote.fareRule", many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var RideQuote = (0, import_core8.list)({
  access: lockedOperationalAccess,
  fields: {
    service: (0, import_fields9.relationship)({ ref: "RideService.quotes", access: { create: () => false, update: () => false } }),
    fareRule: (0, import_fields9.relationship)({ ref: "FareRule.quotes", access: { create: () => false, update: () => false } }),
    publicId: (0, import_fields9.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    handoffId: (0, import_fields9.text)({ isIndexed: true }),
    status: (0, import_fields9.select)({ options: ["active", "accepted", "expired", "void"].map((value) => ({ label: value, value })), defaultValue: "active" }),
    pickupLabel: (0, import_fields9.text)(),
    dropoffLabel: (0, import_fields9.text)(),
    routeInputHash: (0, import_fields9.text)({ access: { read: import_access9.denyAll } }),
    routeEvidence: (0, import_fields9.json)({ defaultValue: {} }),
    estimatedDistanceMeters: (0, import_fields9.integer)(),
    estimatedDurationSeconds: (0, import_fields9.integer)(),
    fareSnapshot: (0, import_fields9.json)({ defaultValue: {} }),
    totalMinor: (0, import_fields9.integer)({ validation: { min: 0 } }),
    currencyCode: (0, import_fields9.text)(),
    scheduledFor: (0, import_fields9.timestamp)(),
    expiresAt: (0, import_fields9.timestamp)({ validation: { isRequired: true } }),
    guestProofHash: (0, import_fields9.text)({ access: { read: import_access9.denyAll } }),
    rider: (0, import_fields9.relationship)({ ref: "User", access: { create: () => false, update: () => false } }),
    request: (0, import_fields9.relationship)({ ref: "RideRequest.quote", access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});

// features/keystone/models/Ride.ts
var import_core9 = require("@keystone-6/core");
var import_access11 = require("@keystone-6/core/access");
var import_fields10 = require("@keystone-6/core/fields");
var RideRequest = (0, import_core9.list)({
  access: lockedOperationalAccess,
  fields: {
    fleet: (0, import_fields10.relationship)({ ref: "Fleet.rides", access: { create: () => false, update: () => false } }),
    rider: (0, import_fields10.relationship)({ ref: "User.requestedRides", access: { create: () => false, update: () => false } }),
    quote: (0, import_fields10.relationship)({ ref: "RideQuote.request", access: { create: () => false, update: () => false } }),
    requestNumber: (0, import_fields10.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    status: (0, import_fields10.select)({ options: ["requested", "matching", "matched", "cancelled", "expired"].map((value) => ({ label: value, value })), defaultValue: "requested" }),
    requestedFor: (0, import_fields10.timestamp)(),
    passengerCount: (0, import_fields10.integer)({ defaultValue: 1, validation: { min: 1, max: 50 } }),
    accessibilityNeeds: (0, import_fields10.json)({ defaultValue: {} }),
    riderNotes: (0, import_fields10.text)({ ui: { displayMode: "textarea" } }),
    pickupLabel: (0, import_fields10.text)(),
    dropoffLabel: (0, import_fields10.text)(),
    preciseRouteEncryptedRef: (0, import_fields10.text)({ access: { read: import_access11.denyAll } }),
    quoteSnapshot: (0, import_fields10.json)({ defaultValue: {} }),
    guestProofHash: (0, import_fields10.text)({ access: { read: import_access11.denyAll } }),
    guestProofExpiresAt: (0, import_fields10.timestamp)(),
    matchOffers: (0, import_fields10.relationship)({ ref: "MatchOffer.request", many: true, access: { create: () => false, update: () => false } }),
    trip: (0, import_fields10.relationship)({ ref: "Trip.request", access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var MatchOffer = (0, import_core9.list)({
  access: lockedOperationalAccess,
  fields: {
    request: (0, import_fields10.relationship)({ ref: "RideRequest.matchOffers", access: { create: () => false, update: () => false } }),
    driver: (0, import_fields10.relationship)({ ref: "DriverProfile.matchOffers", access: { create: () => false, update: () => false } }),
    vehicle: (0, import_fields10.relationship)({ ref: "Vehicle", access: { create: () => false, update: () => false } }),
    status: (0, import_fields10.select)({ options: ["offered", "accepted", "declined", "expired", "withdrawn"].map((value) => ({ label: value, value })), defaultValue: "offered" }),
    offeredAt: (0, import_fields10.timestamp)({ defaultValue: { kind: "now" } }),
    reservationStartAt: (0, import_fields10.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" }, access: { read: import_access11.denyAll, create: () => false, update: () => false } }),
    reservationReleasedAt: (0, import_fields10.timestamp)({ access: { read: import_access11.denyAll, create: () => false, update: () => false } }),
    expiresAt: (0, import_fields10.timestamp)({ validation: { isRequired: true } }),
    respondedAt: (0, import_fields10.timestamp)(),
    declineReason: (0, import_fields10.text)(),
    idempotencyKey: (0, import_fields10.text)({ isIndexed: "unique", access: { read: import_access11.denyAll } }),
    eligibilitySnapshot: (0, import_fields10.json)({ defaultValue: {} }),
    acceptedTrip: (0, import_fields10.relationship)({ ref: "Trip.acceptedOffer", access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var Trip = (0, import_core9.list)({
  access: lockedOperationalAccess,
  fields: {
    fleet: (0, import_fields10.relationship)({ ref: "Fleet.trips", access: { create: () => false, update: () => false } }),
    request: (0, import_fields10.relationship)({ ref: "RideRequest.trip", db: { foreignKey: { map: "request" } }, access: { create: () => false, update: () => false } }),
    acceptedOffer: (0, import_fields10.relationship)({ ref: "MatchOffer.acceptedTrip", db: { foreignKey: { map: "acceptedOffer" } }, access: { create: () => false, update: () => false } }),
    rider: (0, import_fields10.relationship)({ ref: "User.trips", access: { create: () => false, update: () => false } }),
    driver: (0, import_fields10.relationship)({ ref: "DriverProfile.trips", access: { create: () => false, update: () => false } }),
    vehicle: (0, import_fields10.relationship)({ ref: "Vehicle.trips", access: { create: () => false, update: () => false } }),
    confirmationCode: (0, import_fields10.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    status: (0, import_fields10.select)({ options: ["driver_assigned", "driver_en_route", "driver_arrived", "in_progress", "completed", "cancelled", "no_show"].map((value) => ({ label: value, value })), defaultValue: "driver_assigned" }),
    scheduledFor: (0, import_fields10.timestamp)(),
    acceptedAt: (0, import_fields10.timestamp)(),
    enRouteAt: (0, import_fields10.timestamp)(),
    arrivedAt: (0, import_fields10.timestamp)(),
    startedAt: (0, import_fields10.timestamp)(),
    completedAt: (0, import_fields10.timestamp)(),
    cancelledAt: (0, import_fields10.timestamp)(),
    pickupLabel: (0, import_fields10.text)(),
    dropoffLabel: (0, import_fields10.text)(),
    bookingSnapshot: (0, import_fields10.json)({ defaultValue: {} }),
    finalFareSnapshot: (0, import_fields10.json)(),
    managementTokenHash: (0, import_fields10.text)({ access: { read: import_access11.denyAll } }),
    managementTokenExpiresAt: (0, import_fields10.timestamp)(),
    managementTokenRevokedAt: (0, import_fields10.timestamp)(),
    events: (0, import_fields10.relationship)({ ref: "TripEvent.trip", many: true, access: { create: () => false, update: () => false } }),
    locationEvents: (0, import_fields10.relationship)({ ref: "LocationEvent.trip", many: true, access: { create: () => false, update: () => false } }),
    cancellations: (0, import_fields10.relationship)({ ref: "Cancellation.trip", many: true, access: { create: () => false, update: () => false } }),
    payments: (0, import_fields10.relationship)({ ref: "Payment.trip", many: true, access: { create: () => false, update: () => false } }),
    ledgerEntries: (0, import_fields10.relationship)({ ref: "LedgerEntry.trip", many: true, access: { create: () => false, update: () => false } }),
    incidents: (0, import_fields10.relationship)({ ref: "SafetyIncident.trip", many: true, access: { create: () => false, update: () => false } }),
    supportCases: (0, import_fields10.relationship)({ ref: "SupportCase.trip", many: true, access: { create: () => false, update: () => false } }),
    conversation: (0, import_fields10.relationship)({ ref: "Conversation.trip", access: { create: () => false, update: () => false } }),
    reviews: (0, import_fields10.relationship)({ ref: "Review.trip", many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var TripEvent = (0, import_core9.list)({
  access: lockedOperationalAccess,
  fields: {
    trip: (0, import_fields10.relationship)({ ref: "Trip.events", access: { create: () => false, update: () => false } }),
    eventType: (0, import_fields10.text)({ validation: { isRequired: true } }),
    fromStatus: (0, import_fields10.text)(),
    toStatus: (0, import_fields10.text)(),
    actorType: (0, import_fields10.select)({ options: ["rider", "driver", "operator", "provider", "system"].map((value) => ({ label: value, value })) }),
    actorUser: (0, import_fields10.relationship)({ ref: "User", access: { create: () => false, update: () => false } }),
    idempotencyKey: (0, import_fields10.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    occurredAt: (0, import_fields10.timestamp)({ defaultValue: { kind: "now" } }),
    metadata: (0, import_fields10.json)({ defaultValue: {} }),
    ...trackingFields
  }
});
var LocationEvent = (0, import_core9.list)({
  access: { ...lockedOperationalAccess, filter: { ...lockedOperationalAccess.filter, query: async (args) => {
    const scope = await lockedOperationalAccess.filter.query(args);
    return scope === false ? false : { AND: [...scope === true ? [] : [scope], { expiresAt: { gt: (/* @__PURE__ */ new Date()).toISOString() } }] };
  } } },
  fields: {
    trip: (0, import_fields10.relationship)({ ref: "Trip.locationEvents", access: { create: () => false, update: () => false } }),
    actorType: (0, import_fields10.select)({ options: ["driver", "rider", "operator", "provider"].map((value) => ({ label: value, value })) }),
    recordedAt: (0, import_fields10.timestamp)({ validation: { isRequired: true } }),
    coarseGeohash: (0, import_fields10.text)(),
    encryptedCoordinateRef: (0, import_fields10.text)({ access: { read: import_access11.denyAll } }),
    accuracyMeters: (0, import_fields10.integer)(),
    providerEvidence: (0, import_fields10.json)({ defaultValue: {}, access: { read: import_access11.denyAll } }),
    expiresAt: (0, import_fields10.timestamp)(),
    ...trackingFields
  }
});
var Cancellation = (0, import_core9.list)({
  access: lockedOperationalAccess,
  fields: {
    trip: (0, import_fields10.relationship)({ ref: "Trip.cancellations", access: { create: () => false, update: () => false } }),
    actorType: (0, import_fields10.select)({ options: ["rider", "driver", "operator", "system"].map((value) => ({ label: value, value })) }),
    reasonCode: (0, import_fields10.text)(),
    reason: (0, import_fields10.text)(),
    policySnapshot: (0, import_fields10.json)({ defaultValue: {} }),
    feeMinor: (0, import_fields10.integer)({ defaultValue: 0 }),
    currencyCode: (0, import_fields10.text)(),
    refundRequired: (0, import_fields10.select)({ options: ["no", "partial", "full", "manual_review"].map((value) => ({ label: value, value })), defaultValue: "no" }),
    ...trackingFields
  }
});

// features/keystone/models/Safety.ts
var import_core10 = require("@keystone-6/core");
var import_access13 = require("@keystone-6/core/access");
var import_fields11 = require("@keystone-6/core/fields");
var SafetyIncident = (0, import_core10.list)({
  access: lockedFleetAccess("safety"),
  fields: {
    trip: (0, import_fields11.relationship)({ ref: "Trip.incidents", access: { create: () => false, update: () => false } }),
    caseNumber: (0, import_fields11.text)({ isIndexed: "unique" }),
    severity: (0, import_fields11.select)({ options: ["low", "medium", "high", "critical"].map((value) => ({ label: value, value })), defaultValue: "medium" }),
    status: (0, import_fields11.select)({ options: ["open", "triage", "investigating", "resolved", "closed"].map((value) => ({ label: value, value })), defaultValue: "open" }),
    category: (0, import_fields11.text)(),
    summary: (0, import_fields11.text)(),
    restrictedDetails: (0, import_fields11.json)({ defaultValue: {}, access: { read: safetyAccess.operation.query, update: safetyAccess.operation.update } }),
    evidenceRefs: (0, import_fields11.json)({ defaultValue: [] }),
    reportedBy: (0, import_fields11.relationship)({ ref: "User" }),
    assignedTo: (0, import_fields11.relationship)({ ref: "User" }),
    reportedAt: (0, import_fields11.timestamp)({ defaultValue: { kind: "now" } }),
    resolvedAt: (0, import_fields11.timestamp)(),
    ...trackingFields
  }
});
var SupportCase = (0, import_core10.list)({
  access: lockedFleetAccess("safety"),
  fields: {
    trip: (0, import_fields11.relationship)({ ref: "Trip.supportCases", access: { create: () => false, update: () => false } }),
    caseNumber: (0, import_fields11.text)({ isIndexed: "unique" }),
    status: (0, import_fields11.select)({ options: ["open", "waiting", "resolved", "closed"].map((value) => ({ label: value, value })), defaultValue: "open" }),
    category: (0, import_fields11.text)(),
    subject: (0, import_fields11.text)(),
    description: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    priority: (0, import_fields11.select)({ options: ["low", "normal", "high", "urgent"].map((value) => ({ label: value, value })), defaultValue: "normal" }),
    requester: (0, import_fields11.relationship)({ ref: "User" }),
    assignedTo: (0, import_fields11.relationship)({ ref: "User" }),
    resolvedAt: (0, import_fields11.timestamp)(),
    ...trackingFields
  }
});
var Conversation = (0, import_core10.list)({
  access: lockedOperationalAccess,
  fields: { trip: (0, import_fields11.relationship)({ ref: "Trip.conversation", access: { create: () => false, update: () => false } }), status: (0, import_fields11.select)({ options: ["open", "closed", "blocked"].map((value) => ({ label: value, value })), defaultValue: "open" }), messages: (0, import_fields11.relationship)({ ref: "Message.conversation", many: true, access: { create: () => false, update: () => false } }), ...trackingFields }
});
var Message = (0, import_core10.list)({
  access: lockedOperationalAccess,
  fields: {
    conversation: (0, import_fields11.relationship)({ ref: "Conversation.messages", access: { create: () => false, update: () => false } }),
    senderType: (0, import_fields11.select)({ options: ["rider", "driver", "operator", "system"].map((value) => ({ label: value, value })) }),
    sender: (0, import_fields11.relationship)({ ref: "User", access: { create: () => false, update: () => false } }),
    body: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    relayProviderReference: (0, import_fields11.text)({ access: { read: import_access13.denyAll } }),
    status: (0, import_fields11.select)({ options: ["queued", "sent", "delivered", "failed", "blocked"].map((value) => ({ label: value, value })), defaultValue: "queued" }),
    sentAt: (0, import_fields11.timestamp)(),
    metadata: (0, import_fields11.json)({ defaultValue: {} }),
    ...trackingFields
  }
});
var Review = (0, import_core10.list)({
  access: lockedOperationalAccess,
  fields: {
    trip: (0, import_fields11.relationship)({ ref: "Trip.reviews", access: { create: () => false, update: () => false } }),
    author: (0, import_fields11.relationship)({ ref: "User.reviews", access: { create: () => false, update: () => false } }),
    direction: (0, import_fields11.select)({ options: ["rider_to_driver", "driver_to_rider"].map((value) => ({ label: value, value })) }),
    rating: (0, import_fields11.integer)({ validation: { min: 1, max: 5 } }),
    body: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    status: (0, import_fields11.select)({ options: ["pending", "published", "hidden", "removed"].map((value) => ({ label: value, value })), defaultValue: "pending" }),
    submittedAt: (0, import_fields11.timestamp)({ defaultValue: { kind: "now" } }),
    moderatedAt: (0, import_fields11.timestamp)(),
    moderationReason: (0, import_fields11.text)(),
    ...trackingFields
  }
});

// features/keystone/models/Finance.ts
var import_core11 = require("@keystone-6/core");
var import_access15 = require("@keystone-6/core/access");
var import_fields12 = require("@keystone-6/core/fields");
var PaymentProvider = (0, import_core11.list)({
  access: { operation: { query: permissions.canManageFinance, create: permissions.canManageIntegrations, update: permissions.canManageIntegrations, delete: permissions.canManageIntegrations } },
  fields: {
    name: (0, import_fields12.text)({ validation: { isRequired: true } }),
    code: (0, import_fields12.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    isInstalled: (0, import_fields12.select)({ options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }], defaultValue: "no" }),
    credentialsReference: (0, import_fields12.text)({ access: { read: import_access15.denyAll } }),
    metadata: (0, import_fields12.json)({ defaultValue: {} }),
    createPaymentFunction: (0, import_fields12.text)({ validation: { isRequired: true } }),
    capturePaymentFunction: (0, import_fields12.text)({ validation: { isRequired: true } }),
    refundPaymentFunction: (0, import_fields12.text)({ validation: { isRequired: true } }),
    getPaymentStatusFunction: (0, import_fields12.text)({ validation: { isRequired: true } }),
    handleWebhookFunction: (0, import_fields12.text)({ validation: { isRequired: true } }),
    payments: (0, import_fields12.relationship)({ ref: "Payment.provider", many: true, access: { create: () => false, update: () => false } }),
    refunds: (0, import_fields12.relationship)({ ref: "Refund.provider", many: true, access: { create: () => false, update: () => false } }),
    payouts: (0, import_fields12.relationship)({ ref: "Payout.provider", many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var Payment = (0, import_core11.list)({
  access: financeAccess,
  fields: {
    trip: (0, import_fields12.relationship)({ ref: "Trip.payments", access: { create: () => false, update: () => false } }),
    provider: (0, import_fields12.relationship)({ ref: "PaymentProvider.payments", access: { create: () => false, update: () => false } }),
    amountMinor: (0, import_fields12.integer)({ validation: { min: 0 } }),
    currencyCode: (0, import_fields12.text)(),
    status: (0, import_fields12.select)({ options: ["pending", "authorized", "captured", "failed", "partially_refunded", "refunded", "cancelled"].map((value) => ({ label: value, value })), defaultValue: "pending" }),
    providerReference: (0, import_fields12.text)(),
    idempotencyKey: (0, import_fields12.text)({ isIndexed: "unique", access: { read: import_access15.denyAll } }),
    providerEvidence: (0, import_fields12.json)({ defaultValue: {}, access: { read: permissions.canManageFinance } }),
    capturedAt: (0, import_fields12.timestamp)(),
    refunds: (0, import_fields12.relationship)({ ref: "Refund.payment", many: true, access: { create: () => false, update: () => false } }),
    ledgerEntries: (0, import_fields12.relationship)({ ref: "LedgerEntry.payment", many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var Refund = (0, import_core11.list)({
  access: financeAccess,
  fields: {
    payment: (0, import_fields12.relationship)({ ref: "Payment.refunds", access: { create: () => false, update: () => false } }),
    provider: (0, import_fields12.relationship)({ ref: "PaymentProvider.refunds", access: { create: () => false, update: () => false } }),
    amountMinor: (0, import_fields12.integer)({ validation: { min: 0 } }),
    currencyCode: (0, import_fields12.text)(),
    reason: (0, import_fields12.text)(),
    status: (0, import_fields12.select)({ options: ["requested", "processing", "succeeded", "failed", "cancelled"].map((value) => ({ label: value, value })), defaultValue: "requested" }),
    providerReference: (0, import_fields12.text)(),
    idempotencyKey: (0, import_fields12.text)({ isIndexed: "unique", access: { read: import_access15.denyAll } }),
    processedAt: (0, import_fields12.timestamp)(),
    ...trackingFields
  }
});
var LedgerEntry = (0, import_core11.list)({
  access: financeAccess,
  fields: {
    trip: (0, import_fields12.relationship)({ ref: "Trip.ledgerEntries", access: { create: () => false, update: () => false } }),
    payment: (0, import_fields12.relationship)({ ref: "Payment.ledgerEntries", access: { create: () => false, update: () => false } }),
    payout: (0, import_fields12.relationship)({ ref: "Payout.ledgerEntries", access: { create: () => false, update: () => false } }),
    entryKey: (0, import_fields12.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    kind: (0, import_fields12.select)({ options: ["rider_charge", "tax", "platform_fee", "driver_earning", "fleet_share", "tip", "refund", "adjustment", "payout_transfer"].map((value) => ({ label: value, value })) }),
    account: (0, import_fields12.text)({ validation: { isRequired: true } }),
    direction: (0, import_fields12.select)({ options: ["debit", "credit"].map((value) => ({ label: value, value })) }),
    amountMinor: (0, import_fields12.integer)({ validation: { min: 0 } }),
    currencyCode: (0, import_fields12.text)(),
    effectiveAt: (0, import_fields12.timestamp)({ defaultValue: { kind: "now" } }),
    memo: (0, import_fields12.text)(),
    metadata: (0, import_fields12.json)({ defaultValue: {} }),
    ...trackingFields
  }
});
var Payout = (0, import_core11.list)({
  access: financeAccess,
  fields: {
    driver: (0, import_fields12.relationship)({ ref: "DriverProfile", access: { create: () => false, update: () => false } }),
    provider: (0, import_fields12.relationship)({ ref: "PaymentProvider.payouts", access: { create: () => false, update: () => false } }),
    amountMinor: (0, import_fields12.integer)({ validation: { min: 0 } }),
    currencyCode: (0, import_fields12.text)(),
    status: (0, import_fields12.select)({ options: ["pending", "approved", "submitted", "paid", "failed", "cancelled"].map((value) => ({ label: value, value })), defaultValue: "pending" }),
    periodStart: (0, import_fields12.timestamp)(),
    periodEnd: (0, import_fields12.timestamp)(),
    providerReference: (0, import_fields12.text)(),
    evidence: (0, import_fields12.json)({ defaultValue: {} }),
    ledgerEntries: (0, import_fields12.relationship)({ ref: "LedgerEntry.payout", many: true, access: { create: () => false, update: () => false } }),
    paidAt: (0, import_fields12.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/Integration.ts
var import_core12 = require("@keystone-6/core");
var import_access17 = require("@keystone-6/core/access");
var import_fields13 = require("@keystone-6/core/fields");
var Notification = (0, import_core12.list)({
  access: lockedFleetAccess("fleetAdmin"),
  fields: {
    trip: (0, import_fields13.relationship)({ ref: "Trip", access: { create: () => false, update: () => false } }),
    recipient: (0, import_fields13.relationship)({ ref: "User", access: { create: () => false, update: () => false } }),
    channel: (0, import_fields13.select)({ options: ["email", "sms", "push", "webhook"].map((value) => ({ label: value, value })) }),
    templateKey: (0, import_fields13.text)(),
    status: (0, import_fields13.select)({ options: ["queued", "sending", "sent", "delivered", "failed", "dead_letter"].map((value) => ({ label: value, value })), defaultValue: "queued" }),
    payload: (0, import_fields13.json)({ defaultValue: {} }),
    providerReference: (0, import_fields13.text)({ access: { read: import_access17.denyAll } }),
    idempotencyKey: (0, import_fields13.text)({ isIndexed: "unique" }),
    attemptCount: (0, import_fields13.integer)({ defaultValue: 0 }),
    nextAttemptAt: (0, import_fields13.timestamp)(),
    sentAt: (0, import_fields13.timestamp)(),
    lastError: (0, import_fields13.text)(),
    ...trackingFields
  }
});
var MarketplaceRegistration = (0, import_core12.list)({
  access: lockedFleetAccess("fleetAdmin"),
  fields: {
    fleet: (0, import_fields13.relationship)({ ref: "Fleet.marketplaceRegistration", access: { create: () => false, update: () => false } }),
    sourceId: (0, import_fields13.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    platform: (0, import_fields13.text)({ defaultValue: "openfront-rideshare" }),
    status: (0, import_fields13.select)({ options: ["draft", "active", "paused", "revoked"].map((value) => ({ label: value, value })), defaultValue: "draft" }),
    manifestVersion: (0, import_fields13.text)({ defaultValue: "1" }),
    publicBaseUrl: (0, import_fields13.text)(),
    capabilities: (0, import_fields13.json)({ defaultValue: ["marketplace.discovery", "rideshare.quote", "rideshare.request", "rideshare.trip.view"] }),
    lastVerifiedAt: (0, import_fields13.timestamp)(),
    verificationEvidence: (0, import_fields13.json)({ defaultValue: {} }),
    ...trackingFields
  }
});

// features/keystone/models/index.ts
var models = {
  User,
  Role,
  FleetBrandingChange,
  Fleet,
  FleetMembership,
  DriverProfile,
  RiderProfile,
  Vehicle,
  ComplianceDocument,
  Policy,
  PolicyEvaluation,
  ProviderConnection,
  ServiceArea,
  RideService,
  AvailabilityRule,
  AvailabilityException,
  FareRule,
  RideQuote,
  RideRequest,
  RequestCancellationCommand,
  MatchOffer,
  Trip,
  TripEvent,
  LocationEvent,
  Cancellation,
  SafetyIncident,
  SupportCase,
  Conversation,
  Message,
  Review,
  PaymentProvider,
  Payment,
  Refund,
  PaymentObservation,
  LedgerEntry,
  Payout,
  Notification,
  MarketplaceRegistration
};

// features/keystone/domain/authorityFence.ts
async function fenceHumanAuthority(tx, session2, fleetId) {
  const actorId = humanSessionId(session2);
  if (!actorId) throw new Error("A current human session is required.");
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR SHARE`;
  await tx.$queryRaw`SELECT r.id FROM "Role" r JOIN "User" u ON u.role = r.id WHERE u.id = ${actorId} FOR SHARE OF r`;
  if (fleetId) {
    await tx.$queryRaw`SELECT id FROM "Fleet" WHERE id = ${fleetId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "FleetMembership" WHERE "user" = ${actorId} AND fleet = ${fleetId} ORDER BY id FOR SHARE`;
  }
}

// features/keystone/mutations/fleetBranding.ts
var import_node_util = require("node:util");

// features/keystone/domain/commandBinding.ts
var import_node_crypto = require("node:crypto");
function canonical(value, depth = 0) {
  if (depth > 10) throw new Error("Command body is too deep.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => canonical(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== void 0).map((key) => [key, canonical(value[key], depth + 1)]));
  throw new Error("Command body is invalid.");
}
function commandBodyHash(body) {
  const serialized = JSON.stringify(canonical(body));
  if (Buffer.byteLength(serialized) > 32768) throw new Error("Command body is too large.");
  return (0, import_node_crypto.createHash)("sha256").update(serialized).digest("hex");
}
function requireCommandKey(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 200 || value !== value.trim()) throw new Error("A stable command key of 12\u2013200 characters is required.");
  return value;
}

// features/keystone/mutations/fleetBranding.ts
async function fleetBranding(_root, args, context) {
  return context.prisma.$transaction(async (tx) => {
    await fenceHumanAuthority(tx, context.session, args.fleetId);
    if (!await canAccessFleet({ prisma: tx }, context.session, args.fleetId, "fleetAdmin")) return null;
    const row = await tx.fleet.findUnique({ where: { id: args.fleetId }, select: { id: true, name: true, logoIcon: true, logoColor: true, updatedAt: true } });
    return row ? { actorId: context.session.itemId, fleetId: row.id, name: row.name, logoIcon: sanitizeStoreLogoSvg(row.logoIcon || "") || DEFAULT_STORE_LOGO_ICON, logoColor: normalizeStoreLogoColor(row.logoColor), updatedAt: row.updatedAt?.toISOString() } : null;
  }, { isolationLevel: "RepeatableRead" });
}
async function saveFleetBranding(_root, args, context) {
  const idempotencyKey = requireCommandKey(args.idempotencyKey);
  const logoIcon = sanitizeStoreLogoSvg(args.logoIcon);
  if (!logoIcon || !Number.isFinite(Date.parse(args.expectedUpdatedAt))) throw new Error("Branding input is invalid.");
  const logoColor = normalizeStoreLogoColor(args.logoColor);
  return context.prisma.$transaction(async (tx) => {
    const actor = await currentHumanActor(tx, context.session);
    if (!actor || actor.id !== args.expectedActorId) throw new Error("Fleet branding is unavailable.");
    for (const key of [`command:${idempotencyKey}`, `fleet-branding:${args.fleetId}`].sort()) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`;
    await fenceHumanAuthority(tx, context.session, args.fleetId);
    if (!await canAccessFleet({ prisma: tx }, context.session, args.fleetId, "fleetAdmin")) throw new Error("Fleet branding is unavailable.");
    const command = { version: 1, purpose: "fleet_branding", actorId: actor.id, fleetId: args.fleetId, expectedUpdatedAt: args.expectedUpdatedAt, logoIcon, logoColor };
    const prior = await tx.fleetBrandingChange.findUnique({ where: { idempotencyKey } });
    if (prior) {
      if (!(0, import_node_util.isDeepStrictEqual)(prior.command, command)) throw new Error("Branding key belongs to another command.");
      return prior.result;
    }
    const update = await tx.fleet.updateMany({ where: { id: args.fleetId, updatedAt: new Date(args.expectedUpdatedAt) }, data: { logoIcon, logoColor } });
    if (update.count !== 1) throw new Error("Branding changed. Read the current settings before saving again.");
    const row = await tx.fleet.findUnique({ where: { id: args.fleetId }, select: { id: true, name: true, logoIcon: true, logoColor: true, updatedAt: true } });
    const result = { actorId: actor.id, fleetId: row.id, name: row.name, logoIcon: row.logoIcon, logoColor: row.logoColor, updatedAt: row.updatedAt.toISOString() };
    await tx.fleetBrandingChange.create({ data: { fleetId: row.id, actorId: actor.id, idempotencyKey, command, result } });
    return result;
  }, { isolationLevel: "Serializable" });
}

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/mutations/marketplaceRideshare.ts
var import_node_crypto5 = require("node:crypto");

// features/keystone/domain/ownershipProof.ts
var import_node_crypto2 = require("node:crypto");
function secret() {
  const value = process.env.SESSION_SECRET || "";
  if (Buffer.byteLength(value) < 32) throw new Error("Ride receipt proof requires SESSION_SECRET of at least 32 characters.");
  return value;
}
function createOwnershipProof(purpose, resourceId, expiresAt) {
  return signProof({ v: 1, purpose, resourceId, expiresAt: expiresAt.getTime(), nonce: (0, import_node_crypto2.randomBytes)(18).toString("base64url") });
}
function createRecoverableRequestProof(requestId, requestNumber, expiresAt, quoteProof) {
  const nonce = (0, import_node_crypto2.createHmac)("sha256", secret()).update(JSON.stringify(["request-receipt/v2", requestId, requestNumber, expiresAt.getTime(), hashOwnershipProof(quoteProof)])).digest("base64url");
  return signProof({ v: 1, purpose: "request", resourceId: requestNumber, expiresAt: expiresAt.getTime(), nonce });
}
function signProof(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = (0, import_node_crypto2.createHmac)("sha256", secret()).update(body).digest("base64url");
  const token = `${body}.${signature}`;
  return { token, hash: hashOwnershipProof(token), payload };
}
function hashOwnershipProof(token) {
  return (0, import_node_crypto2.createHash)("sha256").update(token).digest("hex");
}
function verifyOwnershipProof(token, purpose, resourceId, expectedHash, now = Date.now()) {
  if (!token || token.length > 4096) return false;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return false;
  const expectedSignature = (0, import_node_crypto2.createHmac)("sha256", secret()).update(body).digest();
  const actualSignature = Buffer.from(signature, "base64url");
  if (expectedSignature.length !== actualSignature.length || !(0, import_node_crypto2.timingSafeEqual)(expectedSignature, actualSignature)) return false;
  if (expectedHash) {
    const actualHash = Buffer.from(hashOwnershipProof(token), "hex");
    const storedHash = Buffer.from(expectedHash, "hex");
    if (actualHash.length !== storedHash.length || !(0, import_node_crypto2.timingSafeEqual)(actualHash, storedHash)) return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return payload.v === 1 && payload.purpose === purpose && payload.resourceId === resourceId && payload.expiresAt > now;
  } catch {
    return false;
  }
}

// features/keystone/domain/requestReceipt.ts
var import_node_crypto3 = require("node:crypto");
function requestIntent(args, riderId) {
  const passengerCount = args.passengerCount ?? 1;
  if (!Number.isInteger(passengerCount) || passengerCount < 1 || passengerCount > 50) throw new Error("Passenger count must be an integer from 1 to 50.");
  const needs = args.accessibilityNeeds ?? {};
  if (!needs || typeof needs !== "object" || Array.isArray(needs) || Object.keys(needs).some((key) => key !== "wheelchairAccessible") || "wheelchairAccessible" in needs && typeof needs.wheelchairAccessible !== "boolean") throw new Error("Accessibility needs must contain only a wheelchairAccessible boolean.");
  const riderNotes = args.riderNotes ?? "";
  const preciseRouteEncryptedRef = args.preciseRouteEncryptedRef ?? "";
  if (typeof riderNotes !== "string" || riderNotes.length > 1e3 || typeof preciseRouteEncryptedRef !== "string" || preciseRouteEncryptedRef.length > 1e3) throw new Error("Request notes or route reference is invalid.");
  return { quoteId: args.quoteId, passengerCount, accessibilityNeeds: { wheelchairAccessible: needs.wheelchairAccessible === true }, riderNotes, preciseRouteEncryptedRef, riderId };
}
function requestIntentHash(intent) {
  return (0, import_node_crypto3.createHash)("sha256").update(JSON.stringify(intent)).digest("hex");
}
function receiptBinding(quote, fleetId, intent) {
  return { version: 2, quoteId: quote.id, quotePublicId: quote.publicId, fleetId, riderId: intent.riderId, intentHash: requestIntentHash(intent) };
}
function recoverRequestReceipt(request, quote, intent, quoteProof) {
  const binding = request.quoteSnapshot?._requestReceipt;
  if (!binding || binding.version !== 2 || binding.quoteId !== quote.id || binding.quotePublicId !== quote.publicId || binding.fleetId !== request.fleetId || binding.riderId !== request.riderId || binding.intentHash !== requestIntentHash(intent) || !request.guestProofHash || !request.guestProofExpiresAt || request.guestProofExpiresAt.getTime() <= Date.now()) throw new Error("Original request receipt cannot be recovered with this intent; use the saved receipt or the owning account.");
  const proof = createRecoverableRequestProof(request.id, request.requestNumber, request.guestProofExpiresAt, quoteProof);
  if (!verifyOwnershipProof(proof.token, "request", request.requestNumber, request.guestProofHash)) throw new Error("Original request receipt is revoked or unavailable; use the owning account.");
  return { requestId: request.id, requestNumber: request.requestNumber, status: request.status, requestProof: proof.token, replayed: true };
}
function riderSessionId(session2) {
  return humanSessionId(session2);
}
function ownsRequest(request, session2, proof) {
  if (session2 && !riderSessionId(session2)) return false;
  const actorId = riderSessionId(session2);
  if (request.riderId) return Boolean(actorId && request.riderId === actorId);
  return Boolean(proof && request.guestProofHash && request.guestProofExpiresAt && new Date(request.guestProofExpiresAt).getTime() > Date.now() && verifyOwnershipProof(proof, "request", request.requestNumber, request.guestProofHash));
}

// features/keystone/domain/requestAuthority.ts
var import_client = require("@prisma/client");
var requestAuthoritySelect = {
  id: true,
  requestNumber: true,
  riderId: true,
  fleetId: true,
  guestProofHash: true,
  guestProofExpiresAt: true
};
async function currentRiderId(db, session2) {
  if (!session2) return null;
  if (!humanSessionId(session2)) throw new Error("A current rider account session is required.");
  await fenceHumanAuthority(db, session2);
  const actor = await currentHumanActor(db, session2);
  if (!actor) throw new Error("A current rider account session is required.");
  return actor.id;
}
async function authorizedRequestHeader(db, session2, requestId, proof) {
  const riderId = await currentRiderId(db, session2);
  if (typeof requestId !== "string" || !requestId || requestId.length > 200) return null;
  if (!riderId && (typeof proof !== "string" || proof.length < 40 || proof.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(proof))) return null;
  const header = await db.rideRequest.findUnique({ where: { id: requestId }, select: requestAuthoritySelect });
  if (!header || !ownsRequest(header, session2, proof)) return null;
  return header;
}
function requestOwnerWhere(header) {
  return {
    id: header.id,
    fleetId: header.fleetId,
    riderId: header.riderId,
    AND: [
      { quoteSnapshot: { path: ["_requestReceipt", "version"], equals: 2 } },
      header.riderId ? { quoteSnapshot: { path: ["_requestReceipt", "riderId"], equals: header.riderId } } : { quoteSnapshot: { path: ["_requestReceipt", "riderId"], equals: import_client.Prisma.JsonNull } }
    ]
  };
}

// features/keystone/domain/requestTripBinding.ts
var import_node_util2 = require("node:util");
function hasRequestQuoteBinding(request) {
  if (!request.fleetId || request.quote?.requestId !== request.id || request.quote.service?.fleetId !== request.fleetId) return false;
  const snapshot = request.quoteSnapshot;
  const present = Boolean(snapshot && Object.prototype.hasOwnProperty.call(snapshot, "_requestReceipt"));
  const binding = snapshot?._requestReceipt;
  return !present || Boolean(binding && binding.version === 2 && binding.quoteId === request.quote.id && binding.quotePublicId === request.quote.publicId && binding.fleetId === request.fleetId && binding.riderId === request.riderId);
}
function hasRequestTripBinding(request, trip) {
  const offer = trip.acceptedOffer;
  const quote = trip.bookingSnapshot?.quote;
  return Boolean(hasRequestQuoteBinding(request) && trip.requestId === request.id && trip.fleetId === request.fleetId && trip.riderId === request.riderId && trip.driverId && trip.vehicleId && offer && trip.acceptedOfferId === offer.id && offer.requestId === request.id && offer.driverId === trip.driverId && offer.vehicleId === trip.vehicleId && (trip.status === "cancelled" ? offer.status === "withdrawn" : offer.status === "accepted") && quote && (0, import_node_util2.isDeepStrictEqual)(quote, request.quoteSnapshot));
}

// features/keystone/domain/publicTripProjection.ts
function projectPublishedReviews(reviews) {
  return (reviews || []).filter((review) => review?.status === "published").map((review) => ({
    direction: review.direction ?? null,
    rating: review.rating ?? null,
    body: review.body ?? null,
    status: "published",
    submittedAt: review.submittedAt ?? null
  }));
}

// features/keystone/domain/fleetBrand.ts
var fleetBrandSelect = { id: true, name: true, logoIcon: true, logoColor: true };
function projectFleetBrand(fleet) {
  if (!fleet?.id || typeof fleet.name !== "string") return null;
  return { fleetId: fleet.id, name: fleet.name, logoIcon: sanitizeStoreLogoSvg(fleet.logoIcon || "") || DEFAULT_STORE_LOGO_ICON, logoColor: normalizeStoreLogoColor(fleet.logoColor) };
}

// features/keystone/domain/riderTripProjection.ts
function projectRiderTrip(trip) {
  const snapshot = trip.bookingSnapshot && typeof trip.bookingSnapshot === "object" ? trip.bookingSnapshot : {};
  const quote = snapshot.quote && typeof snapshot.quote === "object" ? snapshot.quote : {};
  const route = quote.routeEvidence && typeof quote.routeEvidence === "object" ? quote.routeEvidence : {};
  const service = snapshot.service && typeof snapshot.service === "object" ? snapshot.service : {};
  const vehicle = snapshot.vehicle && typeof snapshot.vehicle === "object" ? snapshot.vehicle : {};
  const fare = (value) => ({
    currencyCode: value.currencyCode || null,
    totalMinor: value.totalMinor ?? null,
    baseFareMinor: value.baseFareMinor ?? null,
    distanceMinor: value.distanceMinor ?? null,
    durationMinor: value.durationMinor ?? null,
    bookingFeeMinor: value.bookingFeeMinor ?? null,
    cancellationFeeMinor: value.cancellationFeeMinor ?? null,
    noShowFeeMinor: value.noShowFeeMinor ?? null,
    routeEvidence: { provider: route.provider || "unavailable", authoritative: route.authoritative === true, disclosure: route.disclosure || "Route evidence unavailable." }
  });
  const events = Array.isArray(trip.events) ? trip.events : [];
  return {
    id: trip.id,
    requestId: trip.requestId,
    confirmationCode: trip.confirmationCode,
    status: trip.status,
    scheduledFor: trip.scheduledFor,
    fleetBrand: projectFleetBrand(trip.fleet),
    acceptedAt: trip.acceptedAt,
    enRouteAt: trip.enRouteAt,
    arrivedAt: trip.arrivedAt,
    startedAt: trip.startedAt,
    completedAt: trip.completedAt,
    cancelledAt: trip.cancelledAt,
    pickupLabel: trip.pickupLabel,
    dropoffLabel: trip.dropoffLabel,
    bookingSnapshot: { quote: fare(quote), service: { name: service.name, category: service.category }, vehicle: { label: vehicle.label, make: vehicle.make, model: vehicle.model, color: vehicle.color, plateMasked: vehicle.plateMasked } },
    finalFareSnapshot: trip.finalFareSnapshot && typeof trip.finalFareSnapshot === "object" ? fare(trip.finalFareSnapshot) : null,
    events: events.slice(0, 100).map((event) => ({ eventType: event.eventType, fromStatus: event.fromStatus, toStatus: event.toStatus, occurredAt: event.occurredAt })),
    historyTruncated: events.length > 100,
    payments: (trip.payments || []).map((payment) => ({ amountMinor: payment.amountMinor, currencyCode: payment.currencyCode, status: payment.status })),
    reviews: projectPublishedReviews(trip.reviews)
  };
}

// features/keystone/domain/keysetCursor.ts
function encodeKeyset(purpose, scope, boundary) {
  return Buffer.from(JSON.stringify({ v: 1, purpose, scope, ...boundary })).toString("base64url");
}
function decodeKeyset(value, purpose, scope) {
  if (value === void 0 || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 1600 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid page cursor.");
  let data;
  try {
    data = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid page cursor.");
  }
  if (data?.v !== 1 || data.purpose !== purpose || data.scope !== scope || typeof data.id !== "string" || !data.id || data.id.length > 200 || data.time !== null && (typeof data.time !== "string" || !Number.isFinite(Date.parse(data.time)) || new Date(data.time).toISOString() !== data.time)) throw new Error("Invalid page cursor.");
  return { id: data.id, time: data.time };
}

// features/keystone/mutations/riderReceipts.ts
var requestInclude = {
  fleet: { select: fleetBrandSelect },
  quote: { include: { service: { select: { fleetId: true } } } },
  trip: { include: {
    fleet: { select: fleetBrandSelect },
    acceptedOffer: true,
    events: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 101 },
    payments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 },
    reviews: { where: { status: "published" }, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take: 20 }
  } }
};
function projectRequest(request) {
  const bound = hasRequestQuoteBinding(request);
  const trip = bound && request.trip && hasRequestTripBinding(request, request.trip) ? projectRiderTrip(request.trip) : null;
  return {
    requestId: request.id,
    requestNumber: request.requestNumber,
    status: request.status,
    fleetBrand: projectFleetBrand(request.fleet),
    requestedFor: request.requestedFor,
    pickupLabel: request.pickupLabel,
    dropoffLabel: request.dropoffLabel,
    createdAt: request.createdAt,
    trip,
    handoffState: !bound || request.trip && !trip ? "unavailable" : request.status === "matching" && trip?.status === "cancelled" ? "reassignment_pending" : trip ? "assigned" : "awaiting_assignment"
  };
}
async function riderRequestStatus(_root, args, context) {
  return context.prisma.$transaction(async (tx) => {
    const header = await authorizedRequestHeader(tx, context.session, args.requestId, args.requestProof);
    if (!header) return null;
    const request = await tx.rideRequest.findFirst({ where: requestOwnerWhere(header), include: requestInclude });
    if (!request) return null;
    return projectRequest(request);
  }, { isolationLevel: "RepeatableRead" });
}
async function myRideshareRequests(_root, args, context) {
  return context.prisma.$transaction(async (tx) => {
    const riderId = await currentRiderId(tx, context.session);
    if (!riderId) throw new Error("A rider account session is required.");
    const scope = JSON.stringify([riderId]);
    const boundary = decodeKeyset(args.cursor, "rider_requests", scope);
    const rows = await tx.rideRequest.findMany({
      where: { riderId, ...boundary ? boundary.time === null ? { createdAt: null, id: { lt: boundary.id } } : { OR: [{ createdAt: { lt: new Date(boundary.time) } }, { createdAt: new Date(boundary.time), id: { lt: boundary.id } }, { createdAt: null }] } : {} },
      orderBy: [{ createdAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      take: 26,
      include: requestInclude
    });
    return { items: rows.slice(0, 25).map(projectRequest), nextCursor: rows.length > 25 ? encodeKeyset("rider_requests", scope, { id: rows[24].id, time: rows[24].createdAt?.toISOString() || null }) : null };
  }, { isolationLevel: "RepeatableRead" });
}
async function riderTripStatus(_root, args, context) {
  if (typeof args.confirmationCode !== "string" || !args.confirmationCode || args.confirmationCode.length > 200) return null;
  return context.prisma.$transaction(async (tx) => {
    const riderId = await currentRiderId(tx, context.session);
    const requestId = args.requestId || (riderId ? (await tx.rideRequest.findFirst({ where: { riderId, trip: { confirmationCode: args.confirmationCode } }, select: { id: true } }))?.id : null);
    if (!requestId) return null;
    const header = await authorizedRequestHeader(tx, context.session, requestId, args.requestProof);
    if (!header) return null;
    const request = await tx.rideRequest.findFirst({ where: { ...requestOwnerWhere(header), trip: { is: { confirmationCode: args.confirmationCode } } }, include: requestInclude });
    if (!request || request.trip?.confirmationCode !== args.confirmationCode || !hasRequestTripBinding(request, request.trip)) return null;
    return projectRiderTrip(request.trip);
  }, { isolationLevel: "RepeatableRead" });
}

// features/integrations/mapping/manual.ts
var import_node_crypto4 = require("node:crypto");
async function estimateRoute({ pickupLabel, dropoffLabel }) {
  if (!pickupLabel.trim() || !dropoffLabel.trim()) throw new Error("Pickup and drop-off labels are required.");
  const digest = (0, import_node_crypto4.createHash)("sha256").update(`${pickupLabel.trim()}|${dropoffLabel.trim()}`).digest();
  const distanceMeters = 3e3 + digest.readUInt16BE(0) % 12e3;
  const durationSeconds = Math.round(600 + distanceMeters / 8);
  return {
    distanceMeters,
    durationSeconds,
    evidence: { provider: "manual-estimate", observedAt: (/* @__PURE__ */ new Date()).toISOString(), authoritative: false, disclosure: "Built-in estimate from area labels; no mapping provider was contacted." }
  };
}

// features/keystone/domain/operationalReadiness.ts
function operationsEnabled(mode) {
  return mode === "manual" || process.env.NODE_ENV !== "production";
}
function rideReadiness(mode) {
  const enabled = operationsEnabled(mode);
  return {
    bookingEnabled: enabled,
    mode: mode === "manual" ? "manual" : enabled ? "preview" : "unavailable",
    reason: mode === "manual" ? "An operator assigns your driver." : enabled ? "Preview: routes and fares are estimated." : "Online booking is not open yet."
  };
}
var OPERATIONS_OFF_MESSAGE = "Manual dispatch is off for this fleet. Turn it on in Platform \u2192 Settings \u2192 Operations.";
async function requireFleetOperations(db, fleetId) {
  const fleet = fleetId ? await db.fleet.findUnique({ where: { id: fleetId }, select: { operationsMode: true } }) : null;
  if (!fleet || !operationsEnabled(fleet.operationsMode)) throw new Error(OPERATIONS_OFF_MESSAGE);
}

// features/keystone/domain/serviceReadiness.ts
async function requireServiceReadiness(tx, serviceId, fleetId) {
  if (!serviceId) throw new Error("Service is unavailable.");
  await tx.$queryRaw`SELECT id FROM "RideService" WHERE id = ${serviceId} FOR SHARE`;
  const service = await tx.rideService.findUnique({ where: { id: serviceId }, select: { id: true, fleetId: true, status: true } });
  if (!service?.fleetId || fleetId && service.fleetId !== fleetId || service.status !== "active") throw new Error("Service is unavailable.");
  await tx.$queryRaw`SELECT id FROM "Fleet" WHERE id = ${service.fleetId} FOR SHARE`;
  const fleet = await tx.fleet.findUnique({ where: { id: service.fleetId }, select: { id: true, status: true } });
  const areas = await tx.serviceArea.findMany({ where: { fleetId: service.fleetId, status: "active", services: { some: { id: service.id } } }, orderBy: { id: "asc" }, take: 1, select: { id: true } });
  if (fleet?.status !== "active" || !areas.length) throw new Error("Service is unavailable.");
  await tx.$queryRaw`SELECT id FROM "ServiceArea" WHERE id = ${areas[0].id} FOR SHARE`;
  const area = await tx.serviceArea.findFirst({ where: { id: areas[0].id, fleetId: service.fleetId, status: "active", services: { some: { id: service.id } } }, select: { id: true } });
  if (!area) throw new Error("Service is unavailable.");
  return service;
}

// features/keystone/mutations/marketplaceRideshare.ts
var cleanLabel = (value, name) => {
  const label = String(value || "").trim().replace(/\s+/g, " ");
  if (label.length < 2 || label.length > 120) throw new Error(`${name} must be between 2 and 120 characters.`);
  return label;
};
async function marketplaceRideshareService(_root, args, context) {
  if (typeof args.id !== "string" || !args.id || args.id.length > 200) return null;
  const rows = await marketplaceRideshareServices(null, { serviceId: args.id, limit: 1 }, context);
  return rows[0] || null;
}
async function marketplaceRideshareServiceAreas(_root, args, context) {
  if (typeof args.serviceId !== "string" || !args.serviceId || args.serviceId.length > 200 || args.after && (typeof args.after !== "string" || args.after.length > 200)) throw new Error("Invalid service area page.");
  const service = await context.prisma.rideService.findFirst({ where: { id: args.serviceId, status: "active", fleet: { is: { status: "active" } } }, select: { id: true, fleetId: true } });
  if (!service?.fleetId) return { items: [], nextCursor: null };
  const where = { fleetId: service.fleetId, status: "active", services: { some: { id: service.id } } };
  if (args.after && !await context.prisma.serviceArea.findFirst({ where: { ...where, id: args.after }, select: { id: true } })) throw new Error("Invalid service area page.");
  const rows = await context.prisma.serviceArea.findMany({ where: { ...where, ...args.after ? { id: { gt: args.after } } : {} }, orderBy: { id: "asc" }, take: 25, select: { id: true, name: true, publicRegionLabel: true, countryCode: true } });
  return { items: rows.slice(0, 24), nextCursor: rows.length > 24 ? rows[23].id : null };
}
async function marketplaceRideshareServices(_root, args, context) {
  const limit = Math.max(1, Math.min(Number(args.limit) || 10, 24));
  const query = String(args.query || "").trim().slice(0, 100);
  const location = String(args.location || "").trim().slice(0, 100);
  let boundary = null;
  if (args.after) {
    if (typeof args.after !== "string" || args.after.length > 1600) throw new Error("Invalid discovery cursor.");
    let value;
    try {
      value = JSON.parse(Buffer.from(args.after, "base64url").toString());
    } catch {
      throw new Error("Invalid discovery cursor.");
    }
    if (value?.v !== 1 || value.query !== query || value.location !== location || typeof value.name !== "string" || value.name.length > 300 || typeof value.id !== "string" || value.id.length > 200) throw new Error("Invalid discovery cursor.");
    boundary = value;
  }
  const services = await context.sudo().query.RideService.findMany({
    where: {
      ...args.serviceId ? { id: { equals: args.serviceId } } : {},
      ...boundary ? { AND: [{ OR: [{ name: { gt: boundary.name } }, { name: { equals: boundary.name }, id: { gt: boundary.id } }] }] } : {},
      status: { equals: "active" },
      fleet: { status: { equals: "active" } },
      ...location ? { serviceAreas: { some: { status: { equals: "active" }, publicRegionLabel: { contains: location, mode: "insensitive" } } } } : { serviceAreas: { some: { status: { equals: "active" } } } },
      ...query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] } : {}
    },
    take: limit + 1,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    // Stable bounded public projection.
    query: `id name slug description category passengerCapacity wheelchairAccessible advanceBookingMinutes fleet { id operationsMode name slug publicDescription publicCity countryCode currencyCode logoIcon logoColor } serviceAreas(where: { status: { equals: "active" } }, orderBy: [{ publicRegionLabel: asc }, { id: asc }], take: 25) { id name publicRegionLabel countryCode status fleet { id } } fareRules(where: { status: { equals: "active" } }, orderBy: { version: desc }, take: 1) { id currencyCode baseFareMinor minimumFareMinor }`
  });
  return services.slice(0, limit).filter((service) => service.fleet).map((service, index) => {
    const publicRegionLabels = service.serviceAreas.slice(0, 24).filter((area) => area.fleet?.id === service.fleet.id).map((area) => area.publicRegionLabel);
    return {
      id: service.id,
      title: service.name,
      description: service.description,
      category: service.category,
      passengerCapacity: service.passengerCapacity,
      wheelchairAccessible: service.wheelchairAccessible,
      advanceBookingMinutes: service.advanceBookingMinutes,
      publicRegionLabels,
      readiness: rideReadiness(service.fleet.operationsMode),
      areasTruncated: service.serviceAreas.length > 24,
      nextCursor: services.length > limit && index === limit - 1 ? Buffer.from(JSON.stringify({ v: 1, query, location, name: service.name, id: service.id })).toString("base64url") : null,
      fleet: { ...projectFleetBrand(service.fleet), id: service.fleet.id, name: service.fleet.name, publicDescription: service.fleet.publicDescription, publicCity: service.fleet.publicCity, countryCode: service.fleet.countryCode },
      startingFareMinor: service.fareRules?.[0]?.minimumFareMinor ?? null,
      currencyCode: service.fareRules?.[0]?.currencyCode || service.fleet.currencyCode,
      extension: { schema: "openfront.rideshare.service/v1", value: { category: service.category, passengerCapacity: service.passengerCapacity, wheelchairAccessible: service.wheelchairAccessible, serviceAreas: publicRegionLabels } }
    };
  });
}
async function marketplaceRideshareQuote(_root, args, context) {
  return context.transaction(async (context2) => {
    const riderId = await currentRiderId(context2.prisma, context2.session);
    const pickupLabel = cleanLabel(args.pickupLabel, "pickupLabel");
    const dropoffLabel = cleanLabel(args.dropoffLabel, "dropoffLabel");
    const scheduledFor = args.scheduledFor ? new Date(args.scheduledFor) : null;
    if (scheduledFor && (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now() - 6e4)) throw new Error("scheduledFor must be a future date.");
    const service = await context2.sudo().query.RideService.findOne({ where: { id: args.serviceId }, query: `id name status category passengerCapacity wheelchairAccessible advanceBookingMinutes fleet { id status currencyCode } fareRules(where: { status: { equals: "active" } }, take: 1, orderBy: { version: desc }) { id version currencyCode baseFareMinor perDistanceUnitMinor distanceUnit perMinuteMinor bookingFeeMinor minimumFareMinor maximumMultiplierBasisPoints cancellationFeeMinor noShowFeeMinor }` });
    if (!service || service.status !== "active" || service.fleet?.status !== "active" || !service.fareRules?.[0]) throw new Error("Service is not available for quoting.");
    const passengerCount = args.passengerCount ?? 1;
    if (!Number.isSafeInteger(passengerCount) || passengerCount < 1 || passengerCount > 50) throw new Error("Passenger count must be a whole number from 1 to 50.");
    if (passengerCount > service.passengerCapacity) throw new Error("Passenger count exceeds this service capacity.");
    if (args.wheelchairAccessible && !service.wheelchairAccessible) throw new Error("This service does not advertise wheelchair-accessible vehicles.");
    if (scheduledFor && scheduledFor.getTime() < Date.now() + service.advanceBookingMinutes * 6e4) throw new Error("This service requires more advance notice for scheduled rides.");
    await requireFleetOperations(context2.prisma, service.fleet.id);
    await requireServiceReadiness(context2.prisma, service.id, service.fleet.id);
    const route = await estimateRoute({ pickupLabel, dropoffLabel });
    const rule = service.fareRules[0];
    const breakdown = calculateFare(rule, route.distanceMeters, route.durationSeconds);
    const publicId = `rq_${(0, import_node_crypto5.randomUUID)()}`;
    const expiresAt = new Date(Date.now() + 10 * 6e4);
    const proof = createOwnershipProof("quote", publicId, expiresAt);
    await context2.sudo().query.RideQuote.createOne({ data: {
      publicId,
      ...riderId ? { rider: { connect: { id: riderId } } } : {},
      handoffId: args.handoffId?.trim() || null,
      status: "active",
      service: { connect: { id: service.id } },
      fareRule: { connect: { id: rule.id } },
      pickupLabel,
      dropoffLabel,
      routeInputHash: proof.hash,
      routeEvidence: route.evidence,
      estimatedDistanceMeters: route.distanceMeters,
      estimatedDurationSeconds: route.durationSeconds,
      fareSnapshot: { ...breakdown, _quoteOwner: { kind: riderId ? "account" : "guest", userId: riderId }, cancellationFeeMinor: rule.cancellationFeeMinor, noShowFeeMinor: rule.noShowFeeMinor, fareRuleId: rule.id, fareRuleVersion: rule.version, service: { id: service.id, fleetId: service.fleet.id, name: service.name, category: service.category, passengerCapacity: service.passengerCapacity, wheelchairAccessible: service.wheelchairAccessible }, routeEvidence: route.evidence },
      totalMinor: breakdown.totalMinor,
      currencyCode: breakdown.currencyCode,
      scheduledFor,
      expiresAt,
      guestProofHash: proof.hash
    }, query: "id" });
    return { quoteId: publicId, quoteProof: proof.token, expiresAt: expiresAt.toISOString(), pickupLabel, dropoffLabel, scheduledFor: scheduledFor?.toISOString() || null, estimatedDistanceMeters: route.distanceMeters, estimatedDurationSeconds: route.durationSeconds, cancellationFeeMinor: rule.cancellationFeeMinor, noShowFeeMinor: rule.noShowFeeMinor, fare: breakdown, estimateDisclosure: "Estimated from your pickup and destination areas. The fleet confirms the final fare.", sourceCheckoutPath: `/book?service=${encodeURIComponent(service.id)}` };
  });
}
async function requestRide(_root, args, context) {
  const prisma = context.prisma;
  return prisma.$transaction(async (tx) => {
    const riderId = await currentRiderId(tx, context.session);
    const intent = requestIntent(args, riderId);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${args.quoteId}, 0))::text IS NOT NULL`;
    const quoteHeader = await tx.rideQuote.findUnique({ where: { publicId: args.quoteId }, select: { id: true, publicId: true, guestProofHash: true, riderId: true, requestId: true } });
    if (!quoteHeader?.guestProofHash || typeof args.quoteProof !== "string" || args.quoteProof.length > 4096 || !verifyOwnershipProof(args.quoteProof, "quote", quoteHeader.publicId, quoteHeader.guestProofHash, quoteHeader.requestId ? 0 : Date.now()) || quoteHeader.riderId && quoteHeader.riderId !== riderId) throw new Error("Quote is invalid or not owned by this session.");
    if (quoteHeader.requestId) {
      const requestHeader = await tx.rideRequest.findUnique({ where: { id: quoteHeader.requestId }, select: { id: true, fleetId: true, riderId: true } });
      if (!requestHeader || requestHeader.riderId !== riderId) throw new Error("Original receipt ownership is unavailable.");
      const existing = await tx.rideRequest.findFirst({ where: requestOwnerWhere(requestHeader) });
      if (!existing) throw new Error("Original receipt ownership is unavailable.");
      return recoverRequestReceipt(existing, quoteHeader, intent, args.quoteProof);
    }
    const quote = await tx.rideQuote.findFirst({ where: { id: quoteHeader.id, riderId, fareSnapshot: { path: ["_quoteOwner", "kind"], equals: riderId ? "account" : "guest" } } });
    if (!quote || !quote.guestProofHash || !verifyOwnershipProof(args.quoteProof, "quote", quote.publicId, quote.guestProofHash, quote.requestId ? 0 : Date.now()) || quote.riderId && quote.riderId !== intent.riderId) throw new Error("Quote is invalid or not owned by this session.");
    if (quote.requestId) {
      const existing = await tx.rideRequest.findUnique({ where: { id: quote.requestId } });
      if (!existing || quote.requestId !== existing.id) throw new Error("Request receipt is temporarily unavailable; retry with the same quote proof.");
      const service2 = quote.serviceId ? await tx.rideService.findUnique({ where: { id: quote.serviceId }, select: { fleetId: true } }) : null;
      if (!service2?.fleetId || service2.fleetId !== existing.fleetId) throw new Error("Original request binding is unavailable.");
      return recoverRequestReceipt(existing, quote, intent, args.quoteProof);
    }
    if (quote.status !== "active" || quote.expiresAt <= /* @__PURE__ */ new Date()) throw new Error("Quote is invalid or expired.");
    const quoteSnapshot = quote.fareSnapshot && typeof quote.fareSnapshot === "object" && !Array.isArray(quote.fareSnapshot) ? quote.fareSnapshot : {};
    const serviceSnapshot = quoteSnapshot.service && typeof quoteSnapshot.service === "object" ? quoteSnapshot.service : {};
    const passengerCount = intent.passengerCount;
    if (passengerCount > Number(serviceSnapshot.passengerCapacity || 0)) throw new Error("Passenger count exceeds the quoted service capacity.");
    const accessibilityNeeds = intent.accessibilityNeeds;
    if (accessibilityNeeds.wheelchairAccessible === true && serviceSnapshot.wheelchairAccessible !== true) throw new Error("The quoted service does not meet the accessibility requirement.");
    const requestNumber = `RIDE-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replaceAll("-", "")}-${(0, import_node_crypto5.randomUUID)().slice(0, 8).toUpperCase()}`;
    const proofExpiry = new Date(Date.now() + 24 * 60 * 6e4);
    const requestId = (0, import_node_crypto5.randomUUID)();
    const receiptProof = createRecoverableRequestProof(requestId, requestNumber, proofExpiry, args.quoteProof);
    if (!quote.serviceId) throw new Error("The quote no longer references a service.");
    const service = await requireServiceReadiness(tx, quote.serviceId);
    if (!service?.fleetId) throw new Error("The quoted service is no longer attached to an operating fleet.");
    await requireFleetOperations(tx, service.fleetId);
    const request = await tx.rideRequest.create({ data: {
      id: requestId,
      fleetId: service.fleetId,
      riderId: intent.riderId,
      requestNumber,
      status: "requested",
      requestedFor: quote.scheduledFor,
      passengerCount,
      accessibilityNeeds,
      riderNotes: intent.riderNotes,
      pickupLabel: quote.pickupLabel,
      dropoffLabel: quote.dropoffLabel,
      preciseRouteEncryptedRef: intent.preciseRouteEncryptedRef,
      quoteSnapshot: { ...quoteSnapshot, _requestReceipt: receiptBinding(quote, service.fleetId, intent) },
      guestProofHash: receiptProof.hash,
      guestProofExpiresAt: proofExpiry
    } });
    await tx.rideQuote.update({ where: { id: quote.id }, data: { status: "accepted", request: { connect: { id: request.id } } } });
    return { requestId: request.id, requestNumber, status: request.status, requestProof: receiptProof.token, replayed: false };
  }, { isolationLevel: "Serializable" });
}
async function publicRideshareRequest(_root, args, context) {
  return riderRequestStatus(_root, args, context);
}
async function resolveRideRequestIntent(_root, args, context) {
  return context.prisma.$transaction(async (tx) => {
    const riderId = await currentRiderId(tx, context.session);
    const intent = requestIntent(args, riderId);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${args.quoteId}, 0))::text IS NOT NULL`;
    const header = await tx.rideQuote.findUnique({ where: { publicId: args.quoteId }, select: { id: true, publicId: true, riderId: true, guestProofHash: true, requestId: true } });
    if (!header?.guestProofHash || typeof args.quoteProof !== "string" || args.quoteProof.length > 4096 || !verifyOwnershipProof(args.quoteProof, "quote", header.publicId, header.guestProofHash, 0) || header.riderId !== riderId) throw new Error("Original request intent is unavailable.");
    if (header.requestId) {
      const requestHeader = await tx.rideRequest.findUnique({ where: { id: header.requestId }, select: { id: true, riderId: true, fleetId: true } });
      if (!requestHeader || requestHeader.riderId !== riderId) throw new Error("Original request intent is unavailable.");
      const request = await tx.rideRequest.findFirst({ where: requestOwnerWhere(requestHeader) });
      if (!request) throw new Error("Original request intent is unavailable.");
      return { kind: "request", quoteId: args.quoteId, receipt: recoverRequestReceipt(request, header, intent, args.quoteProof) };
    }
    const quote = await tx.rideQuote.findFirst({ where: { id: header.id, riderId, fareSnapshot: { path: ["_quoteOwner", "kind"], equals: riderId ? "account" : "guest" } } });
    if (!quote) throw new Error("Original quote ownership provenance is unavailable.");
    const snapshot = quote.fareSnapshot || {};
    const binding = { version: 1, purpose: "unused_quote_resolution", riderId, quoteId: header.publicId, intentHash: requestIntentHash(intent) };
    if (snapshot._intentResolution) {
      if (JSON.stringify(snapshot._intentResolution.binding) !== JSON.stringify(binding)) throw new Error("Original resolution body is different.");
      if (quote.status !== "void") throw new Error("Resolution state is unavailable.");
    } else {
      if (!["active", "expired", "void"].includes(quote.status)) throw new Error("Original quote state is unavailable.");
      const closed = await tx.rideQuote.updateMany({ where: { id: quote.id, requestId: null, status: quote.status }, data: { status: "void", fareSnapshot: { ...snapshot, _intentResolution: { binding, result: "closed_unused", occurredAt: (/* @__PURE__ */ new Date()).toISOString() } } } });
      if (closed.count !== 1) throw new Error("Original quote changed; reconcile the same intent again.");
    }
    return { kind: "closed_unused", quoteId: args.quoteId, receipt: null };
  }, { isolationLevel: "Serializable" });
}

// features/keystone/mutations/rideLifecycle.ts
var import_node_crypto6 = require("node:crypto");
var import_node_util3 = require("node:util");

// features/keystone/domain/tripState.ts
var tripTransitions = {
  start_en_route: { from: ["driver_assigned"], to: "driver_en_route" },
  arrive: { from: ["driver_en_route"], to: "driver_arrived" },
  start_trip: { from: ["driver_arrived"], to: "in_progress" },
  complete: { from: ["in_progress"], to: "completed" },
  cancel: { from: ["driver_assigned", "driver_en_route", "driver_arrived"], to: "cancelled" },
  no_show: { from: ["driver_arrived"], to: "no_show" }
};
function nextTripStatus(current, action) {
  const transition = tripTransitions[action];
  if (!transition || !transition.from.includes(current)) throw new Error(`Trip cannot transition from ${current} via ${action}.`);
  return transition.to;
}
function timestampFieldForStatus(status) {
  return { driver_en_route: "enRouteAt", driver_arrived: "arrivedAt", in_progress: "startedAt", completed: "completedAt", cancelled: "cancelledAt" }[status];
}

// features/keystone/domain/availability.ts
function localParts(at, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value.weekday);
  return day < 0 ? null : { day, minutes: Number(value.hour) * 60 + Number(value.minute) };
}
function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}
function isDriverAvailableAt(rules, exceptions, at) {
  if (!Number.isFinite(at.getTime())) return false;
  const covering = exceptions.filter((item) => {
    const start = new Date(item.startsAt).getTime();
    const end = new Date(item.endsAt).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && start <= at.getTime() && end > at.getTime();
  });
  if (covering.some((item) => item.kind === "blocked")) return false;
  if (covering.some((item) => item.kind === "available")) return true;
  return rules.some((rule) => {
    if (rule.status !== "active") return false;
    const effectiveFrom = rule.effectiveFrom ? new Date(rule.effectiveFrom).getTime() : Number.NEGATIVE_INFINITY;
    const effectiveUntil = rule.effectiveUntil ? new Date(rule.effectiveUntil).getTime() : Number.POSITIVE_INFINITY;
    if (rule.effectiveFrom && !Number.isFinite(effectiveFrom) || rule.effectiveUntil && !Number.isFinite(effectiveUntil) || at.getTime() < effectiveFrom || at.getTime() >= effectiveUntil) return false;
    const timezone = rule.timezone || "UTC";
    let local;
    try {
      local = localParts(at, timezone);
    } catch {
      return false;
    }
    if (!local) return false;
    const start = parseTime(rule.startTime);
    const end = parseTime(rule.endTime);
    if (rule.dayOfWeek === null || rule.dayOfWeek === void 0 || start === null || end === null || start === end) return false;
    if (start < end) return rule.dayOfWeek === local.day && local.minutes >= start && local.minutes < end;
    const previousDay = (local.day + 6) % 7;
    return rule.dayOfWeek === local.day && local.minutes >= start || rule.dayOfWeek === previousDay && local.minutes < end;
  });
}

// features/keystone/domain/currentAvailability.ts
async function isCurrentlyAvailableAt(db, driverId, at) {
  const [rules, exceptions] = await Promise.all([
    db.availabilityRule.findMany({ where: { driverId, status: "active", AND: [{ OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: at } }] }, { OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: at } }] }] }, orderBy: { id: "asc" }, take: 1001 }),
    db.availabilityException.findMany({ where: { driverId, startsAt: { lte: at }, endsAt: { gt: at } }, orderBy: { id: "asc" }, take: 1001 })
  ]);
  if (rules.length > 1e3 || exceptions.length > 1e3) throw new Error("Applicable driver availability is incomplete; reconcile the schedule before dispatch.");
  return isDriverAvailableAt(rules, exceptions, at);
}

// features/keystone/domain/tripAuthority.ts
var tripAuthoritySelect = { id: true, fleetId: true, riderId: true, requestId: true, acceptedOfferId: true, driverId: true, vehicleId: true };
function sameTripAuthority(a, b) {
  return a.id === b.id && a.fleetId === b.fleetId && a.riderId === b.riderId && a.requestId === b.requestId && a.acceptedOfferId === b.acceptedOfferId && a.driverId === b.driverId && a.vehicleId === b.vehicleId;
}
async function authorizedTripHeader(db, session2, tripId, purpose, capability = "operations") {
  const actor = await currentHumanActor(db, session2);
  if (!actor) return null;
  const header = await db.trip.findUnique({ where: { id: tripId }, select: tripAuthoritySelect });
  if (!header?.fleetId) return null;
  const fleet = await db.fleet.findUnique({ where: { id: header.fleetId }, select: { id: true } });
  if (fleet?.id !== header.fleetId) return null;
  const operator = purpose !== "reviewParticipant" && await canAccessFleet({ prisma: db }, session2, header.fleetId, capability);
  const driver = header.driverId ? await db.driverProfile.findUnique({ where: { id: header.driverId }, select: { id: true, userId: true, fleetId: true, status: true } }) : null;
  const assignedDriver = Boolean(["participant", "driverOrOperator", "reviewParticipant"].includes(purpose) && driver && driver.userId === actor.id && driver.status === "active" && driver.fleetId === header.fleetId);
  const rider = ["participant", "riderOrOperator", "reviewParticipant"].includes(purpose) && header.riderId === actor.id;
  if (!operator && !assignedDriver && !rider) return null;
  const request = header.requestId ? await db.rideRequest.findUnique({ where: { id: header.requestId }, select: {
    id: true,
    fleetId: true,
    riderId: true,
    trip: { select: { id: true } },
    quote: { select: { requestId: true, service: { select: { fleetId: true } } } }
  } }) : null;
  const offer = header.acceptedOfferId ? await db.matchOffer.findUnique({ where: { id: header.acceptedOfferId }, select: {
    id: true,
    requestId: true,
    driverId: true,
    vehicleId: true
  } }) : null;
  const vehicle = header.vehicleId ? await db.vehicle.findUnique({ where: { id: header.vehicleId }, select: { id: true, fleetId: true } }) : null;
  const bound = Boolean(request && request.id === header.requestId && request.trip?.id === header.id && request.fleetId === header.fleetId && request.riderId === header.riderId && request.quote?.requestId === request.id && request.quote.service?.fleetId === header.fleetId && offer && offer.id === header.acceptedOfferId && offer.requestId === header.requestId && offer.driverId === header.driverId && offer.vehicleId === header.vehicleId && driver && driver.id === header.driverId && driver.fleetId === header.fleetId && vehicle && vehicle.id === header.vehicleId && vehicle.fleetId === header.fleetId);
  return { header, actorId: actor.id, operator, assignedDriver, rider, bound };
}
function tripAuthorityWhere(header) {
  return {
    ...header,
    request: { is: {
      id: header.requestId || "",
      fleetId: header.fleetId,
      riderId: header.riderId,
      quote: { is: { requestId: header.requestId, service: { is: { fleetId: header.fleetId } } } }
    } },
    acceptedOffer: { is: { id: header.acceptedOfferId || "", requestId: header.requestId, driverId: header.driverId, vehicleId: header.vehicleId } },
    driver: { is: { id: header.driverId || "", fleetId: header.fleetId } },
    vehicle: { is: { id: header.vehicleId || "", fleetId: header.fleetId } }
  };
}

// features/keystone/domain/driverDispatchPresence.ts
var ACTIVE_TRIP_STATUSES = ["driver_assigned", "driver_en_route", "driver_arrived", "in_progress"];
var IN_PROGRESS_TRIP_STATUSES = ["driver_en_route", "driver_arrived", "in_progress"];
var PRESENT_DISPATCH_STATUSES = ["available", "offered", "assigned", "on_trip"];
async function refreshDriverPresentDispatchStatus(tx, driverId, now = /* @__PURE__ */ new Date()) {
  const [presentTrip, immediateOffer] = await Promise.all([
    tx.trip.findFirst({
      where: {
        driverId,
        status: { in: ACTIVE_TRIP_STATUSES },
        OR: [
          { scheduledFor: null },
          { scheduledFor: { lte: now } },
          { status: { in: IN_PROGRESS_TRIP_STATUSES } }
        ]
      },
      orderBy: { acceptedAt: "desc" },
      select: { status: true }
    }),
    tx.matchOffer.findFirst({
      where: {
        driverId,
        status: "offered",
        expiresAt: { gt: now },
        reservationReleasedAt: null,
        request: { requestedFor: null }
      },
      select: { id: true }
    })
  ]);
  const dispatchStatus = presentTrip ? IN_PROGRESS_TRIP_STATUSES.includes(presentTrip.status || "") ? "on_trip" : "assigned" : immediateOffer ? "offered" : "available";
  await tx.driverProfile.updateMany({
    where: { id: driverId, status: "active", dispatchStatus: { in: PRESENT_DISPATCH_STATUSES } },
    data: { dispatchStatus }
  });
}

// features/keystone/domain/dispatchSchedule.ts
var FIXED_DISPATCH_RESERVATION_WINDOW_MS = 2 * 60 * 60 * 1e3;
function timeOf(value) {
  if (value == null) return Number.NaN;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
function isFutureScheduledRequest(requestedFor, now) {
  const scheduledAt = timeOf(requestedFor);
  const nowAt = now.getTime();
  return Number.isFinite(scheduledAt) && Number.isFinite(nowAt) && scheduledAt > nowAt;
}
function overlapsFixedDispatchWindow(proposedStart, existingStart, windowMs = FIXED_DISPATCH_RESERVATION_WINDOW_MS) {
  const proposedAt = timeOf(proposedStart);
  const existingAt = timeOf(existingStart);
  if (!Number.isFinite(proposedAt) || !Number.isFinite(existingAt) || !Number.isFinite(windowMs) || windowMs <= 0) return true;
  const proposedEnd = proposedAt + windowMs;
  const existingEnd = existingAt + windowMs;
  if (!Number.isFinite(proposedEnd) || !Number.isFinite(existingEnd)) return true;
  return proposedAt < existingEnd && existingAt < proposedEnd;
}

// features/keystone/domain/eligibility.ts
function isCurrentEligibility(evaluation, kind, fleetId, now) {
  if (!evaluation || evaluation.outcome !== "eligible" || evaluation.policy?.status !== "active" || evaluation.policy.kind !== kind || (evaluation.policy.fleetId ?? evaluation.policy.fleet?.id) !== fleetId) return false;
  if (!Number.isFinite(now.getTime())) return false;
  return !evaluation.expiresAt || new Date(evaluation.expiresAt).getTime() > now.getTime();
}
async function loadCurrentEligibility(db, subject, subjectId, fleetId, now) {
  const kind = `${subject}_eligibility`;
  const policies = await db.policy.findMany({ where: { fleetId, kind, status: "active" }, orderBy: { id: "asc" }, take: 2, select: { id: true, version: true } });
  if (policies.length !== 1) return false;
  const evaluation = await db.policyEvaluation.findFirst({
    where: { policyId: policies[0].id, [`${subject}Id`]: subjectId, [subject === "driver" ? "vehicleId" : "driverId"]: null },
    orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }],
    include: { policy: true }
  });
  const recordedVersion = evaluation?.evidenceSnapshot && !Array.isArray(evaluation.evidenceSnapshot) ? evaluation.evidenceSnapshot.policyVersion : null;
  return recordedVersion === policies[0].version && isCurrentEligibility(evaluation, kind, fleetId, now) ? evaluation : null;
}

// features/keystone/mutations/offerMaintenance.ts
async function expireRideOffers(_root, args, context) {
  return context.prisma.$transaction(async (tx) => {
    await fenceHumanAuthority(tx, context.session, args.fleetId);
    if (!await canAccessFleet({ prisma: tx }, context.session, args.fleetId, "operations")) throw new Error("Fleet is unavailable.");
    const now = /* @__PURE__ */ new Date();
    const rows = await tx.matchOffer.findMany({
      where: {
        status: "offered",
        expiresAt: { lte: now },
        reservationReleasedAt: null,
        request: { is: { fleetId: args.fleetId } },
        driver: { is: { fleetId: args.fleetId } },
        vehicle: { is: { fleetId: args.fleetId } },
        ...args.driverId || args.vehicleId ? { OR: [...args.driverId ? [{ driverId: args.driverId }] : [], ...args.vehicleId ? [{ vehicleId: args.vehicleId }] : []] } : {}
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: 51,
      select: { id: true, driverId: true, requestId: true, vehicleId: true }
    });
    const batch = rows.slice(0, 50);
    const keys = [...new Set(batch.flatMap((row) => [`driver:${row.driverId}`, `offer:${row.id}`, `request:${row.requestId}`, `vehicle:${row.vehicleId}`]))].sort();
    for (const key of keys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`;
    let releasedCount = 0;
    for (const row of batch) {
      const result = await tx.matchOffer.updateMany({ where: { ...row, status: "offered", expiresAt: { lte: now }, reservationReleasedAt: null }, data: { status: "expired", reservationReleasedAt: now, respondedAt: now } });
      releasedCount += result.count;
    }
    for (const driverId of [...new Set(batch.map((row) => row.driverId).filter(Boolean))].sort()) await refreshDriverPresentDispatchStatus(tx, driverId, now);
    return { releasedCount, hasMore: rows.length > 50 };
  }, { isolationLevel: "Serializable" });
}
async function expireRequestFleetOffers(_root, args, context) {
  const header = await context.prisma.rideRequest.findUnique({ where: { id: args.requestId }, select: { fleetId: true } });
  if (!header?.fleetId) throw new Error("Request is unavailable.");
  return expireRideOffers(null, { fleetId: header.fleetId }, context);
}

// features/keystone/domain/tripEconomics.ts
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function requireAcceptedQuoteFee(bookingSnapshot, requestQuoteSnapshot, field) {
  const tripQuote = record(record(bookingSnapshot)?.quote);
  const requestQuote = record(requestQuoteSnapshot);
  const feeMinor = tripQuote?.[field];
  const currencyCode = tripQuote?.currencyCode;
  const requestFeeMinor = requestQuote?.[field];
  const requestCurrencyCode = requestQuote?.currencyCode;
  if (typeof feeMinor !== "number" || !Number.isSafeInteger(feeMinor) || feeMinor < 0 || typeof currencyCode !== "string" || !/^[A-Z]{3}$/.test(currencyCode) || typeof requestFeeMinor !== "number" || !Number.isSafeInteger(requestFeeMinor) || requestFeeMinor < 0 || typeof requestCurrencyCode !== "string" || !/^[A-Z]{3}$/.test(requestCurrencyCode) || feeMinor !== requestFeeMinor || currencyCode !== requestCurrencyCode) {
    const label = field === "cancellationFeeMinor" ? "Cancellation" : "No-show";
    throw new Error(`${label} fee evidence is missing, invalid, or inconsistent with the accepted request quote; manual review is required.`);
  }
  return { feeMinor, currencyCode };
}

// features/keystone/mutations/rideLifecycle.ts
async function requireSignedIn(context) {
  const actor = await currentHumanActor(context.prisma, context.session);
  if (!actor) throw new Error("A current human User session is required.");
  return actor.id;
}
async function operatorOwnsFleet(context, fleetId) {
  return canAccessFleet(context, context.session, fleetId, "operations");
}
async function currentDriver(context) {
  const profiles = await context.sudo().query.DriverProfile.findMany({ where: { user: { id: { equals: context.session?.itemId } } }, take: 1, query: "id fleet { id } status dispatchStatus" });
  return profiles[0] || null;
}
async function offerRideToDriver(_root, args, context) {
  const actorId = await requireSignedIn(context);
  if (args.expectedActorId !== actorId) throw new Error("The acting account changed; reconcile the original command.");
  if (args.idempotencyKey.trim().length < 12 || args.idempotencyKey.length > 200) throw new Error("A stable idempotency key of 12\u2013200 characters is required.");
  if (args.expiresInSeconds != null && !Number.isSafeInteger(args.expiresInSeconds)) throw new Error("Offer duration must be an integer.");
  const prisma = context.prisma;
  const visibleRequest = await prisma.rideRequest.findUnique({ where: { id: args.requestId }, select: { id: true, fleetId: true } });
  if (!visibleRequest?.fleetId || !await operatorOwnsFleet(context, visibleRequest.fleetId)) throw new Error("Ride request was not found.");
  await requireFleetOperations(prisma, visibleRequest.fleetId);
  const existingOffer = await prisma.matchOffer.findUnique({ where: { idempotencyKey: args.idempotencyKey }, select: { id: true } });
  if (!existingOffer) {
    const maintenance = await expireRideOffers(null, { fleetId: visibleRequest.fleetId, driverId: args.driverId, vehicleId: args.vehicleId }, context);
    if (maintenance.hasMore) throw new Error("More expired reservations require release before new dispatch.");
  }
  return prisma.$transaction(async (tx) => {
    const lockKeys = [`driver:${args.driverId}`, `request:${args.requestId}`, `vehicle:${args.vehicleId}`].sort();
    for (const key of lockKeys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`;
    await fenceHumanAuthority(tx, context.session, visibleRequest.fleetId);
    const header = await tx.rideRequest.findUnique({ where: { id: args.requestId }, select: { id: true, fleetId: true } });
    if (!header || header.fleetId !== visibleRequest.fleetId || !await canAccessFleet({ prisma: tx }, context.session, header.fleetId, "operations")) throw new Error("Ride request was not found.");
    const driverHeader = await tx.driverProfile.findUnique({ where: { id: args.driverId }, select: { id: true, fleetId: true } });
    const vehicleHeader = await tx.vehicle.findUnique({ where: { id: args.vehicleId }, select: { id: true, fleetId: true } });
    if (driverHeader?.fleetId !== header.fleetId || vehicleHeader?.fleetId !== header.fleetId) throw new Error("Driver or vehicle lacks current fleet-bound eligibility evidence.");
    const dispatchCommand = { version: 1, purpose: "dispatch_offer", actorId, fleetId: header.fleetId, requestId: args.requestId, driverId: args.driverId, vehicleId: args.vehicleId, expiresInSeconds: args.expiresInSeconds ?? null };
    const replayHeader = await tx.matchOffer.findUnique({ where: { idempotencyKey: args.idempotencyKey }, select: { id: true, requestId: true, driverId: true, vehicleId: true } });
    if (replayHeader) {
      if (replayHeader.requestId !== header.id || replayHeader.driverId !== args.driverId || replayHeader.vehicleId !== args.vehicleId) throw new Error("Idempotency key was already used for another dispatch command.");
      const replay = await tx.matchOffer.findUnique({ where: { id: replayHeader.id } });
      const snapshot = replay?.eligibilitySnapshot;
      if (!replay || !(0, import_node_util3.isDeepStrictEqual)(snapshot?.dispatchCommand, dispatchCommand)) throw new Error("Original dispatch actor/purpose/body binding is unavailable or different; reconcile the retained offer, not a replacement key.");
      return replay;
    }
    const [request, driver] = await Promise.all([
      tx.rideRequest.findFirst({ where: { id: header.id, fleetId: header.fleetId }, include: { quote: { include: { service: true } } } }),
      tx.driverProfile.findFirst({ where: { id: args.driverId, fleetId: header.fleetId }, include: { vehicles: { where: { id: args.vehicleId, fleetId: header.fleetId }, include: { drivers: { where: { id: args.driverId }, select: { id: true } }, policyEvaluations: { orderBy: { evaluatedAt: "desc" }, take: 1, include: { policy: true } } } }, policyEvaluations: { orderBy: { evaluatedAt: "desc" }, take: 1, include: { policy: true } } } })
    ]);
    if (!request) throw new Error("Ride request was not found.");
    if (!["requested", "matching"].includes(request.status || "")) throw new Error("Ride request is not matchable.");
    await requireServiceReadiness(tx, request.quote?.serviceId || null, request.fleetId);
    const service = request.quote?.service;
    if (!service || service.status !== "active") throw new Error("The quoted service is no longer active.");
    const vehicle = driver?.vehicles[0];
    const dispatchNow = /* @__PURE__ */ new Date();
    const driverEligible = request.fleetId && await loadCurrentEligibility(tx, "driver", args.driverId, request.fleetId, dispatchNow);
    const vehicleEligible = request.fleetId && await loadCurrentEligibility(tx, "vehicle", args.vehicleId, request.fleetId, dispatchNow);
    const freshPresence = await tx.driverProfile.findUnique({ where: { id: args.driverId }, select: { dispatchStatus: true } });
    const requestedAt = request.requestedFor || dispatchNow;
    const isFutureScheduled = isFutureScheduledRequest(request.requestedFor, dispatchNow);
    const dispatchStateAllowsRequest = isFutureScheduled ? ["available", "offered", "assigned", "on_trip"].includes(freshPresence?.dispatchStatus || "") : freshPresence?.dispatchStatus === "available";
    if (!driver || driver.fleetId !== request.fleetId || driver.status !== "active" || !dispatchStateAllowsRequest || !driverEligible || !vehicle || vehicle.status !== "active" || vehicle.fleetId !== request.fleetId || vehicle.drivers.length === 0 || !vehicleEligible) {
      throw new Error("Driver or vehicle lacks current fleet-bound eligibility evidence.");
    }
    const accessibilityNeeds = request.accessibilityNeeds && typeof request.accessibilityNeeds === "object" && !Array.isArray(request.accessibilityNeeds) ? request.accessibilityNeeds : {};
    if ((request.passengerCount || 1) > (service.passengerCapacity || 0) || (request.passengerCount || 1) > (vehicle.capacity || 0) || service.wheelchairAccessible && !vehicle.wheelchairAccessible || accessibilityNeeds.wheelchairAccessible === true && !vehicle.wheelchairAccessible) throw new Error("The selected vehicle does not meet this service request.");
    if (request.requestedFor && (!driver.acceptsScheduled || !isFutureScheduledRequest(request.requestedFor, dispatchNow))) throw new Error("This driver or service does not accept the requested schedule.");
    if (!await isCurrentlyAvailableAt(tx, driver.id, requestedAt)) throw new Error("Driver is not available for the requested time.");
    const activeTrips = await tx.trip.findMany({ where: { status: { in: ["driver_assigned", "driver_en_route", "driver_arrived", "in_progress"] }, OR: [{ driverId: driver.id }, { vehicleId: vehicle.id }] }, select: { driverId: true, vehicleId: true, scheduledFor: true, acceptedAt: true } });
    if (activeTrips.some((trip) => overlapsFixedDispatchWindow(requestedAt, trip.scheduledFor || trip.acceptedAt))) throw new Error("Driver or vehicle already has an overlapping active reservation.");
    const outstandingOffers = await tx.matchOffer.findMany({ where: { status: { in: ["offered", "accepted"] }, reservationReleasedAt: null, OR: [{ driverId: driver.id }, { vehicleId: vehicle.id }] }, select: { reservationStartAt: true } });
    if (outstandingOffers.some((item) => overlapsFixedDispatchWindow(requestedAt, item.reservationStartAt))) throw new Error("Driver or vehicle already has an overlapping offer reservation.");
    const expiresAt = new Date(Date.now() + Math.max(30, Math.min(Number(args.expiresInSeconds) || 90, 600)) * 1e3);
    const offer = await tx.matchOffer.create({ data: { requestId: request.id, driverId: driver.id, vehicleId: vehicle.id, reservationStartAt: requestedAt, expiresAt, idempotencyKey: args.idempotencyKey, eligibilitySnapshot: { dispatchCommand, evaluatedAt: (/* @__PURE__ */ new Date()).toISOString(), driverPolicyId: driverEligible.policyId, driverPolicyVersion: driverEligible.policy.version, vehiclePolicyId: vehicleEligible.policyId, vehiclePolicyVersion: vehicleEligible.policy.version, driverEvaluationId: driverEligible.id, vehicleEvaluationId: vehicleEligible.id } } });
    const requestUpdate = await tx.rideRequest.updateMany({ where: { id: request.id, status: { in: ["requested", "matching"] } }, data: { status: "matching" } });
    const driverUpdate = isFutureScheduled ? { count: 1 } : await tx.driverProfile.updateMany({ where: { id: driver.id, status: "active", dispatchStatus: "available" }, data: { dispatchStatus: "offered" } });
    if (requestUpdate.count !== 1 || driverUpdate.count !== 1) throw new Error("Dispatch reservation changed concurrently; reconcile the original command before retrying.");
    return offer;
  }, { isolationLevel: "ReadCommitted" });
}
async function respondToRideOffer(_root, args, context) {
  const actorId = await requireSignedIn(context);
  if (context.session.listKey !== "User" || context.session.apiKeyScopes) throw new Error("A driver User session is required.");
  if (!["accept", "decline"].includes(args.response)) throw new Error("Response must be accept or decline.");
  const responseReason = String(args.reason || "").slice(0, 500);
  const driver = await currentDriver(context);
  if (!driver) throw new Error("An active driver profile is required.");
  await requireFleetOperations(context.prisma, driver.fleet?.id);
  if (args.idempotencyKey.trim().length < 12 || args.idempotencyKey.length > 200) throw new Error("A stable idempotency key of 12\u2013200 characters is required.");
  const prisma = context.prisma;
  const initial = await prisma.matchOffer.findUnique({ where: { id: args.offerId }, select: { requestId: true, driverId: true, vehicleId: true } });
  if (!initial || initial.driverId !== driver.id) throw new Error("Offer was not found.");
  const siblingSnapshots = initial.requestId ? await prisma.matchOffer.findMany({ where: { requestId: initial.requestId, id: { not: args.offerId }, status: "offered" }, select: { driverId: true } }) : [];
  const lockedDriverIds = new Set([initial.driverId, ...siblingSnapshots.map((item) => item.driverId)].filter((id) => Boolean(id)));
  const lockKeys = [
    ...Array.from(lockedDriverIds, (id) => `driver:${id}`),
    `offer:${args.offerId}`,
    `request:${initial.requestId || ""}`,
    `vehicle:${initial.vehicleId || ""}`
  ].sort();
  return prisma.$transaction(async (tx) => {
    for (const key of lockKeys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`;
    const lockedInitial = await tx.matchOffer.findUnique({ where: { id: args.offerId }, select: { requestId: true, driverId: true, vehicleId: true } });
    if (!lockedInitial || lockedInitial.driverId !== initial.driverId || lockedInitial.requestId !== initial.requestId || lockedInitial.vehicleId !== initial.vehicleId) throw new Error("Offer changed concurrently; reload before retrying.");
    await fenceHumanAuthority(tx, context.session, driver.fleet?.id);
    const actingActor = await currentHumanActor(tx, context.session);
    const actingDriver = await tx.driverProfile.findUnique({ where: { id: driver.id }, select: { userId: true, status: true, fleetId: true } });
    const requestHeader = lockedInitial.requestId ? await tx.rideRequest.findUnique({ where: { id: lockedInitial.requestId }, select: { id: true, fleetId: true } }) : null;
    const vehicleHeader = lockedInitial.vehicleId ? await tx.vehicle.findUnique({ where: { id: lockedInitial.vehicleId }, select: { id: true, fleetId: true } }) : null;
    const fleetHeader = requestHeader?.fleetId ? await tx.fleet.findUnique({ where: { id: requestHeader.fleetId }, select: { id: true } }) : null;
    if (actingActor?.id !== actorId || actingDriver?.userId !== actorId || actingDriver.status !== "active" || !requestHeader?.fleetId || fleetHeader?.id !== requestHeader.fleetId || actingDriver.fleetId !== requestHeader.fleetId || vehicleHeader?.fleetId !== requestHeader.fleetId) throw new Error("Offer was not found or driver authority changed.");
    const offer = await tx.matchOffer.findFirst({ where: { id: args.offerId, driverId: driver.id, requestId: requestHeader.id, vehicleId: lockedInitial.vehicleId, request: { is: { id: requestHeader.id, fleetId: requestHeader.fleetId } }, vehicle: { is: { fleetId: requestHeader.fleetId } } }, include: { request: { include: { quote: { include: { service: true } }, trip: true } }, vehicle: true } });
    if (!offer?.request || !offer.vehicle || !hasRequestQuoteBinding(offer.request)) throw new Error("Offer was not found or driver authority changed.");
    if (offer.status !== "offered") {
      if (offer.status === "accepted") {
        const replay = await tx.tripEvent.findUnique({ where: { idempotencyKey: args.idempotencyKey }, include: { trip: { include: { acceptedOffer: true } } } });
        const metadata = replay?.metadata || {};
        if (args.response === "accept" && replay?.trip && ["trip.driver_assigned", "trip.driver_reassigned"].includes(replay.eventType || "") && replay.actorType === "driver" && replay.actorUserId === actorId && metadata.offerId === offer.id && metadata.response === "accept" && (metadata.reason || "") === responseReason && metadata.requestId === offer.request.id && metadata.fleetId === offer.request.fleetId && replay.trip.acceptedOfferId === offer.id && offer.request.trip?.id === replay.tripId && offer.request.status === "matched" && hasRequestTripBinding(offer.request, replay.trip)) return { accepted: true, requestId: offer.request.id, tripId: replay.tripId, confirmationCode: replay.trip?.confirmationCode || null, tripToken: null };
      }
      const snapshot = offer.eligibilitySnapshot || {};
      const command = snapshot.responseCommand;
      if (["declined", "expired"].includes(offer.status || "") && command?.idempotencyKey === args.idempotencyKey && command.actorId === actorId && command.response === args.response && command.reason === responseReason) return { accepted: false, requestId: offer.request.id, tripId: null, confirmationCode: null, tripToken: null };
      throw new Error("Offer is no longer active or the response key does not match its recorded outcome.");
    }
    if (offer.expiresAt <= /* @__PURE__ */ new Date()) {
      await tx.matchOffer.update({ where: { id: offer.id }, data: { status: "expired", respondedAt: /* @__PURE__ */ new Date(), reservationReleasedAt: /* @__PURE__ */ new Date(), eligibilitySnapshot: { ...offer.eligibilitySnapshot || {}, responseCommand: { idempotencyKey: args.idempotencyKey, actorId, response: args.response, reason: responseReason } } } });
      await refreshDriverPresentDispatchStatus(tx, driver.id);
      return { accepted: false, requestId: offer.request.id, tripId: null, confirmationCode: null, tripToken: null };
    }
    if (args.response === "decline") {
      await tx.matchOffer.update({ where: { id: offer.id }, data: { status: "declined", respondedAt: /* @__PURE__ */ new Date(), reservationReleasedAt: /* @__PURE__ */ new Date(), declineReason: responseReason, eligibilitySnapshot: { ...offer.eligibilitySnapshot || {}, responseCommand: { idempotencyKey: args.idempotencyKey, actorId, response: "decline", reason: responseReason } } } });
      await refreshDriverPresentDispatchStatus(tx, driver.id);
      return { accepted: false, requestId: offer.request.id, tripId: null, confirmationCode: null, tripToken: null };
    }
    if (args.response !== "accept") throw new Error("Response must be accept or decline.");
    await requireServiceReadiness(tx, offer.request.quote?.serviceId || null, offer.request.fleetId);
    if (offer.request.status !== "matching" || !offer.vehicleId || offer.request.trip && offer.request.trip.status !== "cancelled") throw new Error("Ride request has already been resolved.");
    const [currentState, acceptedVehicle] = await Promise.all([
      tx.driverProfile.findUnique({ where: { id: driver.id }, include: { policyEvaluations: { orderBy: { evaluatedAt: "desc" }, take: 1, include: { policy: true } } } }),
      tx.vehicle.findUnique({ where: { id: offer.vehicleId }, include: { drivers: { where: { id: driver.id }, select: { id: true } }, policyEvaluations: { orderBy: { evaluatedAt: "desc" }, take: 1, include: { policy: true } } } })
    ]);
    const now = /* @__PURE__ */ new Date();
    const requestFleetId = offer.request.fleetId;
    const driverEligible = requestFleetId && await loadCurrentEligibility(tx, "driver", driver.id, requestFleetId, now);
    const vehicleEligible = requestFleetId && await loadCurrentEligibility(tx, "vehicle", offer.vehicleId, requestFleetId, now);
    const isFutureScheduled = isFutureScheduledRequest(offer.request.requestedFor, now);
    const dispatchStateAllowsAcceptance = isFutureScheduled ? ["available", "offered", "assigned", "on_trip"].includes(currentState?.dispatchStatus || "") : currentState?.dispatchStatus === "offered";
    if (!currentState || currentState.status !== "active" || !dispatchStateAllowsAcceptance || currentState.fleetId !== offer.request.fleetId || !driverEligible || !acceptedVehicle || acceptedVehicle.status !== "active" || acceptedVehicle.fleetId !== offer.request.fleetId || acceptedVehicle.drivers.length === 0 || !vehicleEligible) throw new Error("Driver or vehicle eligibility changed after the offer was made.");
    const service = offer.request.quote?.service;
    const needs = offer.request.accessibilityNeeds && typeof offer.request.accessibilityNeeds === "object" && !Array.isArray(offer.request.accessibilityNeeds) ? offer.request.accessibilityNeeds : {};
    if (!service || service.status !== "active") throw new Error("The quoted service is no longer active.");
    if ((offer.request.passengerCount || 1) > (acceptedVehicle.capacity || 0) || (offer.request.passengerCount || 1) > (service.passengerCapacity || 0) || service.wheelchairAccessible && !acceptedVehicle.wheelchairAccessible || needs.wheelchairAccessible === true && !acceptedVehicle.wheelchairAccessible) throw new Error("The assigned vehicle no longer meets the quoted service requirements.");
    if (offer.request.requestedFor && (!currentState.acceptsScheduled || !isFutureScheduledRequest(offer.request.requestedFor, now))) throw new Error("Driver or service schedule eligibility changed.");
    const acceptanceTime = offer.request.requestedFor || now;
    if (!await isCurrentlyAvailableAt(tx, driver.id, acceptanceTime)) throw new Error("Driver is no longer available for the requested time.");
    const reservations = await tx.trip.findMany({ where: { status: { in: ["driver_assigned", "driver_en_route", "driver_arrived", "in_progress"] }, OR: [{ driverId: driver.id }, { vehicleId: acceptedVehicle.id }] }, select: { scheduledFor: true, acceptedAt: true } });
    if (reservations.some((item) => overlapsFixedDispatchWindow(acceptanceTime, item.scheduledFor || item.acceptedAt))) throw new Error("Driver or vehicle already has an overlapping active reservation.");
    const isReassignment = offer.request.trip?.status === "cancelled";
    const confirmationCode = offer.request.trip?.confirmationCode || `TRIP-${(0, import_node_crypto6.randomUUID)().slice(0, 8).toUpperCase()}`;
    const acceptedAt = /* @__PURE__ */ new Date();
    if (offer.expiresAt <= acceptedAt) throw new Error("Offer lease expired before assignment; recover the original response, not a new command.");
    const requestClaim = await tx.rideRequest.updateMany({ where: { id: offer.request.id, status: "matching" }, data: { status: "matched" } });
    if (requestClaim.count !== 1) throw new Error("Ride request was resolved concurrently; refresh before retrying.");
    const offerClaim = await tx.matchOffer.updateMany({ where: { id: offer.id, requestId: offer.request.id, driverId: driver.id, status: "offered", expiresAt: { gt: acceptedAt } }, data: { status: "accepted", reservationStartAt: offer.request.requestedFor || acceptedAt, respondedAt: acceptedAt, eligibilitySnapshot: { ...offer.eligibilitySnapshot || {}, responseCommand: { idempotencyKey: args.idempotencyKey, actorId: context.session.itemId, response: "accept" } } } });
    if (offerClaim.count !== 1) throw new Error("Offer was withdrawn or answered concurrently.");
    const tripData = {
      fleetId: offer.request.fleetId,
      riderId: offer.request.riderId,
      driverId: driver.id,
      vehicleId: offer.vehicleId,
      requestId: offer.request.id,
      acceptedOfferId: offer.id,
      confirmationCode,
      status: "driver_assigned",
      scheduledFor: offer.request.requestedFor,
      acceptedAt,
      cancelledAt: null,
      enRouteAt: null,
      arrivedAt: null,
      startedAt: null,
      completedAt: null,
      pickupLabel: offer.request.pickupLabel,
      dropoffLabel: offer.request.dropoffLabel,
      bookingSnapshot: { assignmentGeneration: offer.id, acceptedAt: acceptedAt.toISOString(), acceptedOfferId: offer.id, requestId: offer.request.id, fleetId: offer.request.fleetId, quote: offer.request.quoteSnapshot, service: offer.request.quote?.service ? { id: offer.request.quote.service.id, name: offer.request.quote.service.name, category: offer.request.quote.service.category } : null, driver: { id: driver.id, publicName: currentState.publicName }, vehicle: { id: offer.vehicle.id, label: offer.vehicle.label, make: offer.vehicle.make, model: offer.vehicle.model, color: offer.vehicle.color, plateMasked: offer.vehicle.plateMasked } },
      // Acceptance never issues rider authority to a driver. Rider handoff is request-owned.
      // A reassignment preserves any historical driver-issued hash/expiry as evidence.
      managementTokenRevokedAt: offer.request.trip?.managementTokenRevokedAt || /* @__PURE__ */ new Date()
    };
    const trip = isReassignment ? await tx.trip.update({ where: { id: offer.request.trip.id }, data: tripData }) : await tx.trip.create({ data: { ...tripData, managementTokenHash: "", managementTokenExpiresAt: null } });
    await tx.tripEvent.create({ data: { tripId: trip.id, eventType: isReassignment ? "trip.driver_reassigned" : "trip.driver_assigned", fromStatus: isReassignment ? "cancelled" : "matching", toStatus: "driver_assigned", actorType: "driver", actorUserId: context.session.itemId, idempotencyKey: args.idempotencyKey, occurredAt: /* @__PURE__ */ new Date(), metadata: { offerId: offer.id, requestId: offer.request.id, fleetId: offer.request.fleetId, response: "accept", reason: responseReason, assignmentGeneration: offer.id, assignmentSnapshot: tripData.bookingSnapshot, previousAssignmentSnapshot: isReassignment ? offer.request.trip?.bookingSnapshot || null : null, riderHandoff: "request_receipt", notification: "not_requested" } } });
    const siblingOffers = await tx.matchOffer.findMany({ where: { requestId: offer.request.id, id: { not: offer.id }, status: "offered" }, select: { driverId: true } });
    const siblingDriverIds = [...new Set(siblingOffers.map((item) => item.driverId).filter((id) => Boolean(id)))].sort();
    if (siblingDriverIds.some((id) => !lockedDriverIds.has(id))) throw new Error("Sibling offers changed concurrently; reload before retrying.");
    await tx.matchOffer.updateMany({ where: { requestId: offer.request.id, id: { not: offer.id }, status: "offered" }, data: { status: "withdrawn", respondedAt: /* @__PURE__ */ new Date(), reservationReleasedAt: /* @__PURE__ */ new Date() } });
    for (const siblingDriverId of siblingDriverIds) await refreshDriverPresentDispatchStatus(tx, siblingDriverId);
    if (!isFutureScheduled) await tx.driverProfile.update({ where: { id: driver.id }, data: { dispatchStatus: "assigned" } });
    return { accepted: true, requestId: offer.request.id, tripId: trip.id, confirmationCode, tripToken: null };
  }, { isolationLevel: "Serializable" });
}
async function transitionTrip(_root, args, context) {
  const actorId = await requireSignedIn(context);
  if (args.expectedActorId !== actorId) throw new Error("The acting account changed; reconcile the original command.");
  if (args.idempotencyKey.trim().length < 12 || args.idempotencyKey.length > 200) throw new Error("A stable idempotency key of 12\u2013200 characters is required.");
  if (args.action === "cancel") throw new Error("Use the cancellation workflow so the policy and fee decision are recorded consistently.");
  const reason = String(args.reason || "").slice(0, 500);
  const prisma = context.prisma;
  const initialAuthority = await authorizedTripHeader(prisma, context.session, args.tripId, "driverOrOperator");
  if (!initialAuthority) throw new Error("You cannot transition this trip.");
  if (initialAuthority.header.acceptedOfferId !== args.expectedAcceptedOfferId) throw new Error("Original trip assignment changed; reconciliation is required.");
  await requireFleetOperations(prisma, initialAuthority.header.fleetId);
  const lockSnapshot = initialAuthority.header;
  const lockKeys = [
    ...lockSnapshot.driverId ? [`driver:${lockSnapshot.driverId}`] : [],
    ...lockSnapshot.acceptedOfferId ? [`offer:${lockSnapshot.acceptedOfferId}`] : [],
    ...lockSnapshot.requestId ? [`request:${lockSnapshot.requestId}`] : [],
    `trip:${args.tripId}`
  ].sort();
  return prisma.$transaction(async (tx) => {
    for (const key of lockKeys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`;
    await fenceHumanAuthority(tx, context.session, lockSnapshot.fleetId);
    const authority = await authorizedTripHeader(tx, context.session, args.tripId, "driverOrOperator");
    if (!authority) throw new Error("You cannot transition this trip.");
    if (!sameTripAuthority(authority.header, lockSnapshot)) throw new Error("Trip assignment changed concurrently; reload before retrying.");
    if (!authority.bound) throw new Error("Trip request/assignment binding is unavailable; reconcile before transitioning.");
    const trip = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), include: { request: { include: { quote: { include: { service: true } } } }, acceptedOffer: true } });
    if (!trip) throw new Error("Trip not found.");
    const currentAssignedDriver = authority.assignedDriver;
    const actorType = currentAssignedDriver ? "driver" : "operator";
    const commandBinding = { version: 1, purpose: "trip_transition", actorType, ...authority.header };
    if (!trip.request || !hasRequestTripBinding(trip.request, trip)) throw new Error("Trip request/assignment binding is unavailable; reconcile before transitioning.");
    const replay = await tx.tripEvent.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (replay) {
      const metadata = replay.metadata || {};
      if (replay.tripId !== trip.id || replay.actorUserId !== actorId || replay.actorType !== actorType || replay.eventType !== `trip.${replay.toStatus}` || metadata.action !== args.action || metadata.reason !== reason || !(0, import_node_util3.isDeepStrictEqual)(metadata.commandBinding, commandBinding)) throw new Error("Idempotency key belongs to a different actor, trip, or command.");
      return { ...trip, status: replay.toStatus };
    }
    const next = nextTripStatus(trip.status || "", args.action);
    if (args.action === "start_en_route" && trip.scheduledFor && trip.scheduledFor.getTime() > Date.now() + 2 * 60 * 6e4) throw new Error("A scheduled trip cannot start en route more than two hours early.");
    let noShowEconomics = null;
    if (args.action === "no_show") {
      if (trip.scheduledFor && trip.scheduledFor > /* @__PURE__ */ new Date()) throw new Error("A future trip cannot be marked no-show.");
      if (!trip.arrivedAt || trip.arrivedAt.getTime() > Date.now() - 5 * 6e4) throw new Error("The driver must wait at least five minutes after arrival before reporting a no-show.");
      if (!currentAssignedDriver) throw new Error("Only the assigned driver may record a no-show.");
      noShowEconomics = requireAcceptedQuoteFee(trip.bookingSnapshot, trip.request?.quoteSnapshot, "noShowFeeMinor");
    }
    const timeField = timestampFieldForStatus(next);
    const snapshot = trip.bookingSnapshot;
    const quotedFare = snapshot?.quote;
    const finalFare = next === "completed" ? quotedFare || {} : void 0;
    const transitionTime = timeField ? { [timeField]: /* @__PURE__ */ new Date() } : {};
    const updated = await tx.trip.update({ where: { id: trip.id }, data: { status: next, ...transitionTime, ...finalFare ? { finalFareSnapshot: finalFare } : {} } });
    await tx.tripEvent.create({ data: { tripId: trip.id, eventType: `trip.${next}`, fromStatus: trip.status || "", toStatus: next, actorType, actorUserId: actorId, idempotencyKey: args.idempotencyKey, occurredAt: /* @__PURE__ */ new Date(), metadata: { action: args.action, reason, commandBinding } } });
    if (next === "no_show" && noShowEconomics) {
      await tx.cancellation.create({ data: { tripId: trip.id, actorType: "driver", reasonCode: "rider_no_show", reason: reason || "Rider did not arrive", policySnapshot: { source: "accepted_quote_snapshot" }, feeMinor: noShowEconomics.feeMinor, currencyCode: noShowEconomics.currencyCode, refundRequired: "manual_review" } });
    }
    if (trip.driverId && ["driver_en_route", "driver_arrived", "in_progress"].includes(next)) await tx.driverProfile.updateMany({ where: { id: trip.driverId, dispatchStatus: { in: ["available", "offered", "assigned", "on_trip"] } }, data: { dispatchStatus: "on_trip" } });
    if (trip.acceptedOfferId && ["completed", "cancelled", "no_show"].includes(next)) await tx.matchOffer.updateMany({ where: { id: trip.acceptedOfferId, status: "accepted", reservationReleasedAt: null }, data: { reservationReleasedAt: /* @__PURE__ */ new Date() } });
    if (trip.driverId && ["completed", "cancelled", "no_show"].includes(next)) await refreshDriverPresentDispatchStatus(tx, trip.driverId);
    return updated;
  }, { isolationLevel: "Serializable" });
}
async function publicRideshareTrip(_root, args, context) {
  return riderTripStatus(_root, args, context);
}

// features/keystone/mutations/tripOperations.ts
var import_node_crypto7 = require("node:crypto");
var import_node_util4 = require("node:util");
var createReviewBodyHash = (body) => (0, import_node_crypto7.createHash)("sha256").update(body).digest("hex");
async function loadAuthorizedTrip(context, args, capability = "operations", purpose = "participant") {
  if (!humanSessionId(context.session)) throw new Error("Trip not found.");
  const authority = await authorizedTripHeader(context.prisma, context.session, args.tripId, purpose, capability);
  if (!authority) throw new Error(purpose === "reviewParticipant" ? "Only the assigned rider or driver may submit a review." : "Trip not found.");
  if (!authority.bound) throw new Error("Trip binding is unavailable; reconcile the retained trip.");
  const trip = await context.prisma.trip.findFirst({ where: tripAuthorityWhere(authority.header), select: {
    ...tripAuthoritySelect,
    confirmationCode: true,
    status: true,
    bookingSnapshot: true,
    rider: { select: { id: true } },
    driver: { select: { id: true, status: true, fleet: { select: { id: true } }, user: { select: { id: true } } } },
    vehicle: { select: { id: true } },
    fleet: { select: { id: true } },
    request: { select: { id: true, status: true } },
    acceptedOffer: { select: { id: true, driver: { select: { id: true } } } },
    conversation: { select: { id: true, status: true } }
  } });
  if (!trip) throw new Error("Trip not found.");
  return trip;
}
async function tripCancellationPreview(_root, args, context) {
  return context.prisma.$transaction(async (tx) => {
    await fenceHumanAuthority(tx, context.session);
    const authority = await authorizedTripHeader(tx, context.session, args.tripId, "participant");
    if (!authority?.bound) return null;
    const trip = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), include: { request: true } });
    if (!trip || !["driver_assigned", "driver_en_route", "driver_arrived"].includes(trip.status)) return null;
    const economics = requireAcceptedQuoteFee(trip.bookingSnapshot, trip.request?.quoteSnapshot, "cancellationFeeMinor");
    return { tripId: trip.id, actorId: authority.actorId, acceptedOfferId: trip.acceptedOfferId, updatedAt: trip.updatedAt.toISOString(), feeMinor: economics.feeMinor, currencyCode: economics.currencyCode, refundRequired: "manual_review" };
  }, { isolationLevel: "RepeatableRead" });
}
async function riderRequestCancellationPreview(_root, args, context) {
  return context.prisma.$transaction(async (tx) => {
    const header = await authorizedRequestHeader(tx, context.session, args.requestId, args.requestProof);
    if (!header) return null;
    const request = await tx.rideRequest.findFirst({ where: requestOwnerWhere(header), select: { id: true, status: true, trip: { select: { status: true } } } });
    if (!request || !["requested", "matching"].includes(request.status) || request.trip && request.trip.status !== "cancelled") return null;
    return { requestId: request.id, actorId: header.riderId || "guest", status: request.status };
  }, { isolationLevel: "RepeatableRead" });
}
async function cancelRideRequest(_root, args, context) {
  if (typeof args.idempotencyKey !== "string" || args.idempotencyKey.trim().length < 12 || args.idempotencyKey.length > 200) throw new Error("A stable idempotency key of 12\u2013200 characters is required.");
  const prisma = context.prisma;
  const authorize = async (db, request) => {
    const actor = humanSessionId(context.session) ? await currentHumanActor(db, context.session) : null;
    const riderOwner = ownsRequest(request, request.riderId ? actor ? context.session : void 0 : context.session, args.requestProof);
    const operator = await canAccessFleet({ prisma: db }, context.session, request.fleetId, "operations");
    return riderOwner || operator;
  };
  const visible = await prisma.rideRequest.findUnique({ where: { id: args.requestId }, select: { id: true, riderId: true, fleetId: true, requestNumber: true, guestProofHash: true, guestProofExpiresAt: true } });
  if (!visible || !await authorize(prisma, visible)) throw new Error("Ride request was not found.");
  const visibleOwner = ownsRequest(visible, context.session, args.requestProof);
  const expectedActor = visibleOwner ? visible.riderId || "guest" : humanSessionId(context.session);
  if (!expectedActor || args.expectedActorId !== expectedActor) throw new Error("Cancellation actor changed; reconcile the original command.");
  const offerSnapshot = await context.prisma.matchOffer.findMany({ where: { requestId: args.requestId, status: { in: ["offered", "accepted"] } }, select: { driverId: true } });
  const lockedDriverIds = new Set(offerSnapshot.map((offer) => offer.driverId).filter((id) => Boolean(id)));
  const lockKeys = [`command:${args.idempotencyKey}`, ...Array.from(lockedDriverIds, (id) => `driver:${id}`), `request:${args.requestId}`].sort();
  return context.prisma.$transaction(async (tx) => {
    for (const key of lockKeys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`;
    if (humanSessionId(context.session)) await fenceHumanAuthority(tx, context.session, visible.fleetId);
    const header = await tx.rideRequest.findUnique({ where: { id: args.requestId }, select: { id: true, riderId: true, fleetId: true, requestNumber: true, guestProofHash: true, guestProofExpiresAt: true } });
    if (!header || header.fleetId !== visible.fleetId || header.riderId !== visible.riderId || !await authorize(tx, header)) throw new Error("Ride request was not found.");
    const recorded = await tx.requestCancellationCommand.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (recorded && recorded.requestId !== header.id) throw new Error("Cancellation key belongs to another request.");
    const current = await tx.rideRequest.findFirst({ where: requestOwnerWhere(header), include: { trip: true } });
    if (!current) throw new Error("Ride request was not found.");
    const owner = ownsRequest(header, context.session, args.requestProof);
    const actualActor = owner ? header.riderId || "guest" : humanSessionId(context.session);
    if (actualActor !== args.expectedActorId) throw new Error("Cancellation actor changed; reconcile the original command.");
    const command = { version: 1, purpose: "request_cancellation", requestId: current.id, fleetId: current.fleetId, actorKind: owner ? header.riderId ? "rider" : "guest" : "operator", actorId: actualActor, ...owner && !header.riderId ? { originalProofHash: header.guestProofHash } : {} };
    if (recorded) {
      if (!(0, import_node_util4.isDeepStrictEqual)(recorded.command, command) || recorded.result?.requestId !== current.id || recorded.result.status !== "cancelled") throw new Error("Cancellation key belongs to another command.");
      return { ...recorded.result, replayed: true, alreadyCancelled: false };
    }
    if (current.status === "cancelled") return { requestId: current.id, status: current.status, replayed: false, alreadyCancelled: true };
    if (!["requested", "matching"].includes(current.status || "") || current.trip && current.trip.status !== "cancelled") throw new Error("This ride request has already been matched to a trip and must be cancelled through its trip receipt.");
    const result = { requestId: current.id, status: "cancelled", replayed: false, alreadyCancelled: false };
    const requestUpdate = await tx.rideRequest.updateMany({ where: { id: current.id, status: { in: ["requested", "matching"] } }, data: { status: "cancelled" } });
    if (requestUpdate.count !== 1) throw new Error("Ride request changed concurrently; reload before retrying.");
    const outstandingOffers = await tx.matchOffer.findMany({ where: { requestId: current.id, status: { in: ["offered", "accepted"] } }, select: { driverId: true } });
    const offeredDriverIds = Array.from(new Set(outstandingOffers.map((offer) => offer.driverId).filter((id) => Boolean(id)))).sort();
    if (offeredDriverIds.some((id) => !lockedDriverIds.has(id))) throw new Error("Dispatch offers changed concurrently; reload before retrying cancellation.");
    await tx.matchOffer.updateMany({ where: { requestId: current.id, status: { in: ["offered", "accepted"] } }, data: { status: "withdrawn", respondedAt: /* @__PURE__ */ new Date(), reservationReleasedAt: /* @__PURE__ */ new Date() } });
    for (const driverId of offeredDriverIds) await refreshDriverPresentDispatchStatus(tx, driverId);
    await tx.requestCancellationCommand.create({ data: { requestId: current.id, idempotencyKey: args.idempotencyKey, command, result } });
    return result;
  }, { isolationLevel: "Serializable" });
}
async function cancelRide(_root, args, context) {
  if (typeof args.idempotencyKey !== "string" || args.idempotencyKey.trim().length < 12 || args.idempotencyKey.length > 200) throw new Error("A stable idempotency key of 12\u2013200 characters is required.");
  const initialAuthority = await authorizedTripHeader(context.prisma, context.session, args.tripId, "participant");
  if (!initialAuthority) throw new Error("Trip not found.");
  if (args.expectedActorId !== initialAuthority.actorId || args.expectedAcceptedOfferId !== initialAuthority.header.acceptedOfferId) throw new Error("Cancellation actor or assignment changed; reconciliation is required.");
  if (!initialAuthority.bound) throw new Error("Trip binding is unavailable; reconcile the retained trip.");
  const header = initialAuthority.header;
  await requireFleetOperations(context.prisma, header.fleetId);
  const visible = { id: header.id, driver: header.driverId ? { id: header.driverId } : null, vehicle: header.vehicleId ? { id: header.vehicleId } : null, request: header.requestId ? { id: header.requestId } : null, acceptedOffer: header.acceptedOfferId ? { id: header.acceptedOfferId } : null, fleet: { id: header.fleetId } };
  const actorId = initialAuthority.actorId;
  const reasonCode = String(args.reasonCode || "other").trim().slice(0, 80);
  const reason = String(args.reason || "").trim().slice(0, 500);
  if (args.reassign && !initialAuthority.operator) throw new Error("Only an authorized fleet operator may cancel and reassign this request.");
  const offerSnapshot = visible.request?.id ? await context.prisma.matchOffer.findMany({ where: { requestId: visible.request.id, status: { in: ["offered", "accepted"] } }, select: { id: true, driverId: true } }) : [];
  const lockedDriverIds = new Set([visible.driver?.id, ...offerSnapshot.map((offer) => offer.driverId)].filter((id) => Boolean(id)));
  const lockedOfferIds = new Set([visible.acceptedOffer?.id, ...offerSnapshot.map((offer) => offer.id)].filter((id) => Boolean(id)));
  const expectedOfferLockSet = offerSnapshot.map((offer) => JSON.stringify([offer.id, offer.driverId])).sort();
  const lockKeys = [
    ...Array.from(lockedDriverIds, (id) => `driver:${id}`),
    ...Array.from(lockedOfferIds, (id) => `offer:${id}`),
    `request:${visible.request?.id || ""}`,
    `trip:${visible.id}`,
    `vehicle:${visible.vehicle?.id || ""}`
  ].sort();
  return context.prisma.$transaction(async (tx) => {
    for (const key of lockKeys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`;
    await fenceHumanAuthority(tx, context.session, header.fleetId);
    const authority = await authorizedTripHeader(tx, context.session, visible.id, "participant");
    if (!authority) throw new Error("Trip not found.");
    if (!sameTripAuthority(authority.header, header)) throw new Error("Trip assignment changed concurrently; reload before retrying.");
    if (!authority.bound) throw new Error("Trip binding is unavailable; reconcile the retained trip.");
    const current = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), include: { driver: { select: { userId: true, status: true, fleetId: true } }, request: true, acceptedOffer: true } });
    if (!current) throw new Error("Trip not found.");
    const actorType = authority.assignedDriver ? "driver" : authority.rider ? "rider" : "operator";
    if (args.reassign && (!authority.operator || actorType !== "operator")) throw new Error("Only an authorized fleet operator may cancel and reassign this request.");
    const commandBinding = { version: 2, purpose: "trip_cancellation", actorType, ...authority.header, reviewed: { updatedAt: args.expectedUpdatedAt, feeMinor: args.expectedFeeMinor, currencyCode: args.expectedCurrencyCode } };
    const replay = await tx.tripEvent.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (replay) {
      const metadata = replay.metadata || {};
      if (replay.tripId !== current.id || replay.actorUserId !== actorId || replay.actorType !== actorType || replay.eventType !== (args.reassign ? "trip.cancelled_for_reassignment" : "trip.cancelled") || metadata.reasonCode !== reasonCode || metadata.reason !== reason || metadata.reassign !== Boolean(args.reassign) || !(0, import_node_util4.isDeepStrictEqual)(metadata.commandBinding, commandBinding)) throw new Error("Idempotency key belongs to another cancellation command.");
      const prior = metadata.cancellationId ? await tx.cancellation.findUnique({ where: { id: String(metadata.cancellationId) } }) : null;
      if (!prior) throw new Error("Cancellation receipt is unavailable; reconciliation is required.");
      return prior;
    }
    if (!["driver_assigned", "driver_en_route", "driver_arrived"].includes(current.status || "") || !current.requestId || !current.acceptedOfferId) throw new Error("Trip can no longer be cancelled or reassigned.");
    const cancellationEconomics = requireAcceptedQuoteFee(current.bookingSnapshot, current.request?.quoteSnapshot, "cancellationFeeMinor");
    if (current.updatedAt.toISOString() !== args.expectedUpdatedAt || cancellationEconomics.feeMinor !== args.expectedFeeMinor || cancellationEconomics.currencyCode !== args.expectedCurrencyCode) throw new Error("Cancellation review changed. Reconciliation is required before another command.");
    const releaseOffers = await tx.matchOffer.findMany({ where: { requestId: current.requestId, status: { in: ["offered", "accepted"] } }, select: { id: true, driverId: true } });
    const actualOfferLockSet = releaseOffers.map((offer) => JSON.stringify([offer.id, offer.driverId])).sort();
    if (actualOfferLockSet.length !== expectedOfferLockSet.length || actualOfferLockSet.some((key, index) => key !== expectedOfferLockSet[index])) throw new Error("Affected offers changed concurrently; reload before retrying.");
    if (releaseOffers.some((offer) => !lockedOfferIds.has(offer.id) || Boolean(offer.driverId && !lockedDriverIds.has(offer.driverId)))) throw new Error("Affected driver or offer lock set changed; reload before retrying.");
    const tripUpdate = await tx.trip.updateMany({ where: { id: current.id, requestId: current.requestId, acceptedOfferId: current.acceptedOfferId, status: { in: ["driver_assigned", "driver_en_route", "driver_arrived"] } }, data: { status: "cancelled", cancelledAt: /* @__PURE__ */ new Date(), managementTokenRevokedAt: /* @__PURE__ */ new Date() } });
    if (tripUpdate.count !== 1) throw new Error("Trip assignment changed concurrently; reload before retrying.");
    const offerUpdate = await tx.matchOffer.updateMany({ where: { requestId: current.requestId, status: { in: ["offered", "accepted"] } }, data: { status: "withdrawn", respondedAt: /* @__PURE__ */ new Date(), reservationReleasedAt: /* @__PURE__ */ new Date() } });
    if (offerUpdate.count < 1) throw new Error("Accepted offer could not be invalidated; cancellation was rolled back.");
    const requestUpdate = await tx.rideRequest.updateMany({ where: { id: current.requestId, status: "matched" }, data: { status: args.reassign ? "matching" : "cancelled" } });
    if (requestUpdate.count !== 1) throw new Error("Ride request changed concurrently; cancellation was rolled back.");
    const cancellation = await tx.cancellation.create({ data: { tripId: current.id, actorType, reasonCode, reason, policySnapshot: { assignmentGeneration: current.acceptedOfferId, acceptedAssignment: current.bookingSnapshot, cancellationPolicy: current.bookingSnapshot?.cancellationPolicy || {} }, feeMinor: cancellationEconomics.feeMinor, currencyCode: cancellationEconomics.currencyCode, refundRequired: "manual_review" } });
    await tx.tripEvent.create({ data: { tripId: current.id, eventType: args.reassign ? "trip.cancelled_for_reassignment" : "trip.cancelled", fromStatus: current.status || "", toStatus: "cancelled", actorType, actorUserId: actorId, idempotencyKey: args.idempotencyKey, occurredAt: /* @__PURE__ */ new Date(), metadata: { commandBinding, reasonCode, reason, feeMinor: cancellationEconomics.feeMinor, reassign: Boolean(args.reassign), cancellationId: cancellation.id, invalidatedOfferCount: offerUpdate.count, disclosure: "No refund or notification is initiated by this command." } } });
    const refreshDriverIds = new Set([current.driverId, ...releaseOffers.map((offer) => offer.driverId)].filter((id) => Boolean(id)));
    if ([...refreshDriverIds].some((id) => !lockedDriverIds.has(id))) throw new Error("Affected driver lock set changed; reload before retrying.");
    for (const driverId of [...refreshDriverIds].sort()) await refreshDriverPresentDispatchStatus(tx, driverId);
    return cancellation;
  }, { isolationLevel: "Serializable" });
}
async function recordTripLocation(_root, args, context) {
  if (!humanSessionId(context.session)) throw new Error("Trip not found.");
  return context.transaction(async (transactionContext) => {
    const trip = await loadAuthorizedTrip(transactionContext, args, "operations", "driverOrOperator");
    if (!["driver_en_route", "driver_arrived", "in_progress"].includes(trip.status || "")) throw new Error("Location is not accepted for this trip state.");
    const fleetOperator = await canAccessFleet(transactionContext, context.session, trip.fleet?.id, "operations");
    if (context.session?.itemId !== trip.driver?.user?.id && !fleetOperator) throw new Error("Only the assigned driver or authorized fleet operator may record location.");
    const fleet = await transactionContext.prisma.fleet.findUnique({ where: { id: trip.fleet.id }, select: { preciseLocationRetentionDays: true } });
    const days = Number(fleet?.preciseLocationRetentionDays);
    if (!Number.isSafeInteger(days) || days < 1 || days > 3650) throw new Error("Location retention policy is unavailable.");
    if (args.encryptedCoordinateRef) throw new Error("Precise location storage is unavailable until reference ownership can be verified.");
    const recordedAt = new Date(args.recordedAt || Date.now());
    if (!Number.isFinite(recordedAt.getTime()) || recordedAt.getTime() > Date.now()) throw new Error("Location observation time is invalid.");
    const coarseGeohash = String(args.coarseGeohash || "");
    if (!/^[0123456789bcdefghjkmnpqrstuvwxyz]{0,7}$/.test(coarseGeohash)) throw new Error("Coarse location is invalid.");
    const observation = args.providerEvidence ?? {};
    if (!observation || typeof observation !== "object" || Array.isArray(observation) || Object.keys(observation).some((key) => !["observationId", "clientVersion"].includes(key)) || Object.values(observation).some((value) => typeof value !== "string" || value.length > 100 || !/^[a-zA-Z0-9_.:-]*$/.test(value))) throw new Error("Location observation metadata is invalid.");
    const accuracyMeters = args.accuracyMeters ?? 0;
    if (!Number.isSafeInteger(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 1e4) throw new Error("Location accuracy is invalid.");
    return transactionContext.sudo().query.LocationEvent.createOne({ data: { trip: { connect: { id: trip.id } }, actorType: context.session?.itemId === trip.driver?.user?.id ? "driver" : "operator", recordedAt, coarseGeohash, encryptedCoordinateRef: "", accuracyMeters, providerEvidence: { ...observation, source: "client_observation", authoritative: false, actorUserId: context.session.itemId }, expiresAt: new Date(recordedAt.getTime() + days * 24 * 60 * 6e4) }, query: "id recordedAt coarseGeohash expiresAt" });
  });
}
async function keyedTripSubmission(context, args, purpose, capability, body, create) {
  const key = requireCommandKey(args.idempotencyKey);
  const bodyHash = commandBodyHash(body);
  return context.transaction(async (tx) => {
    await fenceHumanAuthority(tx.prisma, context.session);
    for (const lock of [`command:${key}`, `trip:${args.tripId}`].sort()) await tx.prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text IS NOT NULL`;
    const trip = await loadAuthorizedTrip(tx, args, capability, "participant");
    const actorId = context.session.itemId;
    const actorType = actorId === trip.driver?.user?.id ? "driver" : actorId === trip.rider?.id ? "rider" : "operator";
    const commandBinding = { version: 1, purpose, actorId, actorType, bodyHash, tripId: trip.id, fleetId: trip.fleetId, requestId: trip.requestId, acceptedOfferId: trip.acceptedOfferId, driverId: trip.driverId, vehicleId: trip.vehicleId };
    const prior = await tx.prisma.tripEvent.findUnique({ where: { idempotencyKey: key } });
    if (prior) {
      if (prior.tripId !== trip.id || prior.actorUserId !== actorId || prior.eventType !== purpose || !(0, import_node_util4.isDeepStrictEqual)(prior.metadata?.commandBinding, commandBinding) || !prior.metadata?.result?.id) throw new Error("Command key belongs to another submission or assignment.");
      return prior.metadata.result;
    }
    const result = await create(tx, trip, actorType);
    if (!result || typeof result.id !== "string" || !result.id) throw new Error("Submission receipt is unavailable.");
    await tx.prisma.tripEvent.create({ data: { tripId: trip.id, eventType: purpose, actorType, actorUserId: actorId, idempotencyKey: key, occurredAt: /* @__PURE__ */ new Date(), metadata: { commandBinding, result } } });
    return result;
  }, { isolationLevel: "Serializable" });
}
async function sendTripMessage(_root, args, context) {
  const body = String(args.body || "").trim();
  if (!body || body.length > 2e3) throw new Error("Message must be between 1 and 2000 characters.");
  return keyedTripSubmission(context, args, "trip.message_submitted", "operations", { body }, async (tx, trip, actorType) => {
    const sudo = tx.sudo();
    let conversation = trip.conversation;
    if (!conversation) conversation = await sudo.query.Conversation.createOne({ data: { trip: { connect: { id: trip.id } }, status: "open" }, query: "id status" });
    if (conversation.status !== "open") throw new Error("Conversation is not open.");
    return sudo.query.Message.createOne({ data: { conversation: { connect: { id: conversation.id } }, senderType: actorType, sender: { connect: { id: context.session.itemId } }, body, status: "queued", metadata: { directContactShared: false } }, query: "id senderType status createdAt" });
  });
}
async function reportSafetyIncident(_root, args, context) {
  const severity = args.severity || "medium";
  if (!["low", "medium", "high", "critical"].includes(severity)) throw new Error("Incident severity is invalid.");
  const category = String(args.category || "other").trim();
  const summary = String(args.summary || "").trim();
  if (!summary || summary.length > 500 || category.length > 80) throw new Error("Incident category or summary is invalid.");
  const restrictedDetails = args.restrictedDetails || {};
  const evidenceRefs = args.evidenceRefs || [];
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length > 50 || evidenceRefs.some((ref) => typeof ref !== "string" || ref.length > 1e3)) throw new Error("Incident evidence references are invalid.");
  return keyedTripSubmission(context, args, "trip.incident_submitted", "safety", { severity, category, summary, restrictedDetails, evidenceRefs }, (tx, trip) => tx.sudo().query.SafetyIncident.createOne({ data: { trip: { connect: { id: trip.id } }, caseNumber: `SAFE-${(0, import_node_crypto7.randomUUID)().slice(0, 8).toUpperCase()}`, severity, status: "open", category, summary, restrictedDetails, evidenceRefs, reportedBy: { connect: { id: context.session.itemId } }, reportedAt: /* @__PURE__ */ new Date() }, query: "id caseNumber severity status reportedAt" }));
}
async function openSupportCase(_root, args, context) {
  const category = String(args.category || "trip").trim();
  const subject = String(args.subject || "").trim();
  const description = String(args.description || "").trim();
  if (!subject || subject.length > 160 || !description || description.length > 2e3 || category.length > 80) throw new Error("Support subject or description is invalid.");
  return keyedTripSubmission(context, args, "trip.support_submitted", "safety", { category, subject, description }, (tx, trip) => tx.sudo().query.SupportCase.createOne({ data: { trip: { connect: { id: trip.id } }, caseNumber: `HELP-${(0, import_node_crypto7.randomUUID)().slice(0, 8).toUpperCase()}`, status: "open", category, subject, description, priority: "normal", requester: { connect: { id: context.session.itemId } } }, query: "id caseNumber status createdAt" }));
}
async function submitTripReview(_root, args, context) {
  const trip = await loadAuthorizedTrip(context, args, "operations", "reviewParticipant");
  if (trip.status !== "completed") throw new Error("Only completed trips can be reviewed.");
  const actorId = context.session?.itemId || null;
  const isDriver = Boolean(actorId && actorId === trip.driver?.user?.id);
  const isRider = Boolean(actorId && actorId === trip.rider?.id);
  if (!isDriver && !isRider) throw new Error("Only the assigned rider or driver may submit a review.");
  const rating = Number(args.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("Rating must be an integer from 1 to 5.");
  const idempotencyKey = String(args.idempotencyKey || "").trim();
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) throw new Error("A stable idempotency key of 12\u2013200 characters is required.");
  const direction = isDriver ? "driver_to_rider" : "rider_to_driver";
  const body = String(args.body || "").trim().slice(0, 2e3);
  const prisma = context.prisma;
  return prisma.$transaction(async (tx) => {
    const lockKey = `review:${trip.id}:${direction}:${actorId || "receipt-holder"}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text IS NOT NULL`;
    const authority = await authorizedTripHeader(tx, context.session, trip.id, "reviewParticipant");
    if (!authority?.bound || !sameTripAuthority(authority.header, trip)) throw new Error("Trip review authority or assignment changed; reconcile before retrying.");
    const current = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), select: { status: true } });
    if (current?.status !== "completed") throw new Error("Only completed trips can be reviewed.");
    const replay = await tx.tripEvent.findUnique({ where: { idempotencyKey } });
    if (replay) {
      const metadata = replay.metadata || {};
      if (replay.tripId !== trip.id || replay.actorUserId !== actorId || replay.eventType !== "trip.review_submitted" || metadata.direction !== direction || metadata.rating !== rating || metadata.bodyHash !== createReviewBodyHash(body)) throw new Error("Idempotency key belongs to another review command.");
      const replayReview = metadata.reviewId ? await tx.review.findUnique({ where: { id: String(metadata.reviewId) } }) : null;
      if (!replayReview) throw new Error("Review receipt is unavailable; reconciliation is required.");
      return replayReview;
    }
    const existing = await tx.review.findFirst({ where: { tripId: trip.id, authorId: actorId, direction } });
    if (existing) {
      if (existing.rating === rating && existing.body === body) return existing;
      throw new Error("A review has already been submitted for this trip and direction.");
    }
    const review = await tx.review.create({ data: { tripId: trip.id, authorId: actorId, direction, rating, body, status: "pending", submittedAt: /* @__PURE__ */ new Date() } });
    await tx.tripEvent.create({ data: { tripId: trip.id, eventType: "trip.review_submitted", fromStatus: "completed", toStatus: "completed", actorType: isDriver ? "driver" : "rider", actorUserId: actorId, idempotencyKey, occurredAt: /* @__PURE__ */ new Date(), metadata: { reviewId: review.id, direction, rating, bodyHash: createReviewBodyHash(body) } } });
    return review;
  }, { isolationLevel: "Serializable" });
}

// features/integrations/payment/index.ts
var paymentProviderAdapters = {
  manual: () => Promise.resolve().then(() => (init_manual(), manual_exports))
};

// features/keystone/utils/paymentProviderAdapter.ts
async function executePaymentAdapter({ provider, functionName, args }) {
  const adapterName = provider[functionName];
  const loader = paymentProviderAdapters[adapterName];
  if (!loader) throw new Error("Payment adapter is not admitted by this deployment.");
  const adapter = await loader();
  const fn = adapter[functionName];
  if (typeof fn !== "function") throw new Error(`Payment adapter does not implement ${functionName}.`);
  return fn({ provider, ...args });
}

// features/keystone/mutations/finance.ts
var import_node_util5 = require("node:util");
var import_node_crypto8 = require("node:crypto");
function requireIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (key.length < 12 || key.length > 200) throw new Error("A stable idempotency key of 12\u2013200 characters is required.");
  return key;
}
async function appendObservation(prisma, paymentId, observation) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${paymentId}`}, 0))::text IS NOT NULL`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error("Original payment evidence is unavailable.");
    return tx.paymentObservation.create({ data: { paymentId, refundId: observation.refundId || null, observationKey: (0, import_node_crypto8.randomUUID)(), details: observation } });
  }, { isolationLevel: "Serializable" });
}
function moneySnapshot(value) {
  const quote = value?.quote && typeof value.quote === "object" ? value.quote : {};
  const fare = quote.fare && typeof quote.fare === "object" ? quote.fare : {};
  const amount = quote.totalMinor ?? fare.totalMinor;
  const currency = quote.currencyCode ?? fare.currencyCode;
  if (typeof currency !== "string") throw new Error("Trip currency evidence is unavailable.");
  currencyDigits(currency);
  if (!validMinor(amount) || amount <= 0) throw new Error("Trip does not have a payable fare snapshot.");
  return { amount, currency };
}
async function initiateTripPayment(_root, args, context) {
  if (!humanSessionId(context.session)) throw new Error("Authentication is required.");
  const idempotencyKey = requireIdempotencyKey(args.idempotencyKey);
  const prisma = context.prisma;
  const preflight = await prisma.$transaction(async (tx) => {
    const authority = await authorizedTripHeader(tx, context.session, args.tripId, "riderOrOperator", "finance");
    if (!authority?.bound) throw new Error("Trip not found.");
    const trip2 = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), select: { id: true, status: true, rider: { select: { id: true } }, fleet: { select: { id: true } }, bookingSnapshot: true } });
    if (!trip2) throw new Error("Trip not found.");
    return { trip: trip2, header: authority.header };
  }, { isolationLevel: "RepeatableRead" });
  const trip = preflight.trip;
  await requireFleetOperations(prisma, trip.fleet?.id);
  const sudo = context.sudo();
  if (!["driver_assigned", "driver_en_route", "driver_arrived", "in_progress", "completed"].includes(trip.status || "")) throw new Error("Trip is not in a payable state.");
  const { amount, currency } = moneySnapshot(trip.bookingSnapshot);
  const provider = await sudo.query.PaymentProvider.findOne({ where: { code: args.providerCode }, query: "id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction handleWebhookFunction" });
  if (!provider || provider.isInstalled !== "yes") throw new Error("Payment provider is unavailable.");
  const reservation = await prisma.$transaction(async (tx) => {
    const lockKey = `payment-init:${trip.id}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text IS NOT NULL`;
    await fenceHumanAuthority(tx, context.session, preflight.header.fleetId);
    const authority = await authorizedTripHeader(tx, context.session, trip.id, "riderOrOperator", "finance");
    if (!authority?.bound || !sameTripAuthority(authority.header, preflight.header)) throw new Error("Trip payment authority or assignment changed; reconciliation is required.");
    const currentTrip = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), select: { status: true, bookingSnapshot: true } });
    if (!currentTrip || !["driver_assigned", "driver_en_route", "driver_arrived", "in_progress", "completed"].includes(currentTrip.status || "")) throw new Error("Trip is not in a payable state.");
    const currentMoney = moneySnapshot(currentTrip.bookingSnapshot);
    if (currentMoney.amount !== amount || currentMoney.currency !== currency) throw new Error("Accepted payment economics changed; reconciliation is required.");
    const replay = await tx.payment.findUnique({ where: { idempotencyKey } });
    const command = { version: 1, purpose: "payment_initiation", actorId: context.session.itemId, assignment: authority.header, body: { tripId: args.tripId, providerCode: args.providerCode, amountMinor: amount, currencyCode: currency } };
    if (replay) {
      const evidence2 = replay.providerEvidence;
      if (replay.tripId !== trip.id || replay.providerId !== provider.id || replay.amountMinor !== amount || replay.currencyCode !== currency || !(0, import_node_util5.isDeepStrictEqual)(evidence2?.command, command)) throw new Error("Idempotency key belongs to a different payment intent or original binding is unavailable.");
      return { payment: replay, shouldExecute: false };
    }
    const active = await tx.payment.findFirst({ where: { tripId: trip.id, status: { in: ["pending", "authorized", "captured", "partially_refunded"] } } });
    if (active) throw new Error("A payment attempt already exists for this trip. Reconciliation is required before another attempt.");
    const payment = await tx.payment.create({ data: {
      tripId: trip.id,
      providerId: provider.id,
      amountMinor: amount,
      currencyCode: currency,
      status: "pending",
      idempotencyKey,
      providerEvidence: { command, providerSnapshot: { ...provider }, phase: "intent_recorded", adapter: provider.createPaymentFunction, disclosure: "No money movement has been verified." }
    } });
    return { payment, shouldExecute: true };
  }, { isolationLevel: "Serializable" });
  if (!reservation.shouldExecute) return reservation.payment;
  let evidence;
  try {
    evidence = await executePaymentAdapter({ provider, functionName: "createPaymentFunction", args: { trip, amount, currency, idempotencyKey } });
  } catch {
    await appendObservation(prisma, reservation.payment.id, { observationId: `${reservation.payment.id}:create`, providerId: provider.id, amountMinor: amount, currencyCode: currency, phase: "outcome_indeterminate", observedAt: (/* @__PURE__ */ new Date()).toISOString() });
    throw new Error("Payment outcome is indeterminate. The durable intent was retained for reconciliation; do not submit a new key.");
  }
  await appendObservation(prisma, reservation.payment.id, { observationId: `${reservation.payment.id}:create`, providerId: provider.id, amountMinor: amount, currencyCode: currency, phase: "pending", externalId: String(evidence.externalId || "").slice(0, 200), observedAt: (/* @__PURE__ */ new Date()).toISOString() });
  return prisma.payment.update({ where: { id: reservation.payment.id }, data: {
    status: "pending",
    providerReference: String(evidence.externalId || "")
  } });
}
async function requestTripRefund(_root, args, context) {
  if (!humanSessionId(context.session)) throw new Error("Authentication is required.");
  const idempotencyKey = requireIdempotencyKey(args.idempotencyKey);
  const amount = Number(args.amountMinor);
  if (!validMinor(amount) || amount <= 0) throw new Error("Refund amount must be a positive integer in minor currency units.");
  const reason = args.reason ?? "";
  if (typeof reason !== "string" || reason.length > 500) throw new Error("Refund reason is invalid.");
  const prisma = context.prisma;
  const preflight = await prisma.$transaction(async (tx) => {
    const paymentHeader = await tx.payment.findUnique({ where: { id: args.paymentId }, select: { id: true, tripId: true } });
    const authority = paymentHeader?.tripId ? await authorizedTripHeader(tx, context.session, paymentHeader.tripId, "operator", "finance") : null;
    if (!authority?.bound) throw new Error("Payment is not refundable.");
    const payment2 = await tx.payment.findFirst({ where: { id: args.paymentId, tripId: authority.header.id }, select: { id: true, amountMinor: true, currencyCode: true, status: true, providerReference: true, providerEvidence: true, provider: { select: { id: true, code: true, isInstalled: true, refundPaymentFunction: true } } } });
    if (!payment2) throw new Error("Payment is not refundable.");
    return { payment: payment2, header: authority.header };
  }, { isolationLevel: "RepeatableRead" });
  await requireFleetOperations(prisma, preflight.header.fleetId);
  const payment = preflight.payment;
  if (!["captured", "partially_refunded"].includes(payment.status || "")) throw new Error("Payment is not refundable.");
  const provider = payment.provider;
  if (!provider || provider.isInstalled !== "yes" || payment.amountMinor == null || payment.amountMinor <= 0 || !/^[A-Z]{3}$/.test(payment.currencyCode || "")) throw new Error("Payment evidence is incomplete and requires manual review.");
  const reservation = await prisma.$transaction(async (tx) => {
    const lockKey = `payment:${payment.id}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text IS NOT NULL`;
    await fenceHumanAuthority(tx, context.session, preflight.header.fleetId);
    const authority = await authorizedTripHeader(tx, context.session, preflight.header.id, "operator", "finance");
    if (!authority?.bound || !sameTripAuthority(authority.header, preflight.header)) throw new Error("Refund authority or assignment changed; reconciliation is required.");
    const paymentHeader = await tx.payment.findUnique({ where: { id: payment.id }, select: { id: true, tripId: true, providerId: true } });
    if (paymentHeader?.tripId !== authority.header.id || paymentHeader.providerId !== payment.provider?.id) throw new Error("Refund payment binding changed; reconciliation is required.");
    const replay = await tx.refund.findUnique({ where: { idempotencyKey } });
    const commandBinding = { version: 1, purpose: "payment_refund", actorId: context.session.itemId, assignment: authority.header, bodyHash: commandBodyHash({ paymentId: args.paymentId, amountMinor: amount, reason }) };
    const priorCommand = await tx.tripEvent.findUnique({ where: { idempotencyKey } });
    if (replay) {
      if (replay.paymentId !== payment.id || replay.amountMinor !== amount || !(0, import_node_util5.isDeepStrictEqual)(priorCommand?.metadata?.commandBinding, commandBinding)) throw new Error("Idempotency key belongs to a different refund command or original binding is unavailable.");
      return { refund: replay, shouldExecute: false };
    }
    const currentPayment = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!currentPayment || !["captured", "partially_refunded"].includes(currentPayment.status || "")) throw new Error("Payment is no longer refundable.");
    const reservedRefunds = await tx.refund.aggregate({ where: { paymentId: payment.id, status: { in: ["requested", "processing", "succeeded"] } }, _sum: { amountMinor: true } });
    const alreadyReserved = reservedRefunds._sum.amountMinor || 0;
    if (currentPayment.amountMinor == null || amount > currentPayment.amountMinor - alreadyReserved) throw new Error("Refund amount exceeds the available balance after pending reservations.");
    const refund = await tx.refund.create({ data: {
      paymentId: payment.id,
      providerId: provider.id,
      amountMinor: amount,
      currencyCode: payment.currencyCode,
      reason,
      status: "processing",
      idempotencyKey
    } });
    await tx.tripEvent.create({ data: { tripId: authority.header.id, eventType: "finance.refund_reserved", actorType: "operator", actorUserId: context.session.itemId, idempotencyKey, occurredAt: /* @__PURE__ */ new Date(), metadata: { commandBinding, refundId: refund.id, providerId: provider.id } } });
    return { refund, shouldExecute: true };
  }, { isolationLevel: "Serializable" });
  if (!reservation.shouldExecute) return reservation.refund;
  let evidence;
  try {
    evidence = await executePaymentAdapter({ provider, functionName: "refundPaymentFunction", args: { paymentId: payment.providerReference, amount, currency: payment.currencyCode, idempotencyKey } });
  } catch {
    await appendObservation(prisma, payment.id, { observationId: `${reservation.refund.id}:result`, refundId: reservation.refund.id, providerId: provider.id, amountMinor: amount, currencyCode: payment.currencyCode, phase: "outcome_indeterminate", observedAt: (/* @__PURE__ */ new Date()).toISOString() });
    throw new Error("Refund outcome is indeterminate. Its balance remains reserved pending reconciliation; do not submit a new key.");
  }
  const status = evidence.status === "succeeded" ? "succeeded" : "processing";
  await appendObservation(prisma, payment.id, { observationId: `${reservation.refund.id}:result`, refundId: reservation.refund.id, providerId: provider.id, amountMinor: amount, currencyCode: payment.currencyCode, phase: status, externalId: String(evidence.externalId || "").slice(0, 200), observedAt: (/* @__PURE__ */ new Date()).toISOString() });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${payment.id}`}, 0))::text IS NOT NULL`;
    const original = await tx.refund.findUnique({ where: { id: reservation.refund.id } });
    if (!original || original.paymentId !== payment.id || original.providerId !== provider.id || original.idempotencyKey !== idempotencyKey) throw new Error("Original refund binding is unavailable.");
    if (original.status === "succeeded") return original;
    const refund = await tx.refund.update({ where: { id: original.id }, data: {
      status,
      providerReference: String(evidence.externalId || ""),
      processedAt: status === "succeeded" ? /* @__PURE__ */ new Date() : null
    } });
    if (status === "succeeded") {
      const current = await tx.payment.findUnique({ where: { id: payment.id } });
      const totalSucceeded = await tx.refund.aggregate({ where: { paymentId: payment.id, status: "succeeded" }, _sum: { amountMinor: true } });
      if (!current || current.amountMinor == null || (totalSucceeded._sum.amountMinor || 0) > current.amountMinor) throw new Error("Refund evidence exceeds original tender; reconciliation is required.");
      await tx.payment.update({ where: { id: payment.id }, data: { status: (totalSucceeded._sum.amountMinor || 0) === current.amountMinor ? "refunded" : "partially_refunded" } });
    }
    return refund;
  }, { isolationLevel: "Serializable" });
}

// features/keystone/domain/demoSeedCompleteness.ts
var demoSeedInspectionSelections = {
  fleet: `id slug status providers(where: { kind: { in: ["mapping", "notification", "identity", "background_check"] } }, orderBy: [{ id: asc }], take: 10) { kind adapter status } marketplaceRegistration { sourceId platform status manifestVersion }`,
  membership: "id role status fleet { id } user { id }",
  serviceArea: "id status fleet { id }",
  service: `id slug status passengerCapacity wheelchairAccessible fleet { id }
    serviceAreas(where: { status: { equals: "active" } }, orderBy: [{ id: asc }], take: 25) { id status fleet { id } }
    fareRules(where: { status: { equals: "active" } }, orderBy: [{ id: asc }], take: 25) {
      id status fleet { id } service { id fleet { id } } serviceArea { id status fleet { id } }
    }`,
  policy: `id name kind status fleet { id } evaluations(orderBy: [{ id: asc }], take: 50) {
    id policy { id status fleet { id } } driver { id status fleet { id } } vehicle { id status fleet { id } }
  }`,
  driver: `id status user { id } fleet { id }
    availabilityRules(where: { status: { equals: "active" } }, orderBy: [{ dayOfWeek: asc }, { id: asc }], take: 10) { id dayOfWeek status }`,
  vehicle: `id status capacity wheelchairAccessible fleet { id }
    drivers(where: { status: { equals: "active" } }, orderBy: [{ id: asc }], take: 25) { id status fleet { id } }`,
  document: "kind driver { id fleet { id } } vehicle { id fleet { id } }",
  paymentProvider: "id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction handleWebhookFunction"
};
async function readRows(read) {
  try {
    const rows = await read();
    return Array.isArray(rows) ? { rows, readable: true } : { rows: [], readable: false };
  } catch {
    return { rows: [], readable: false };
  }
}
var rowInFleet = (row, fleetId) => Boolean(row && row.fleet?.id === fleetId);
var activeInFleet = (row, fleetId) => row?.status === "active" && rowInFleet(row, fleetId);
async function inspectExistingDemoFleet(sudo, context, fleet, userId, mode) {
  const limitations = [
    "These checks verify demo fixture structure only; policy-evaluation records are not evidence of approval, licensing, insurance, background clearance, or driver admission.",
    "Provider rows are configuration fixtures only; no provider connectivity, installation, payment, notification, or identity action was checked or performed.",
    "Structural completeness is not dispatch eligibility, operational readiness, or permission to carry real passengers.",
    "This existing-fleet diagnostic does not create or repair demo records.",
    "Document checks read only bounded kind and relationship metadata through normal driver List access; no file references, evidence contents, review notes, or approval state are projected.",
    "Required document kinds mirror the current demo seed policy only; an owner must validate any real onboarding evidence policy before operational use."
  ];
  const missing = [];
  const fleetId = typeof fleet.id === "string" ? fleet.id : "";
  if (!fleetId) missing.push("existing demo fleet identifier could not be verified");
  if (mode !== "minimal" && mode !== "full") {
    missing.push("supported demo seed mode (minimal or full)");
  }
  if (fleet.status !== "active") missing.push("active demo fleet fixture status");
  if (!fleetId || mode !== "minimal" && mode !== "full") {
    return makeDiagnostic(mode, missing, limitations);
  }
  const scopedSeed = typeof fleet.slug === "string" && fleet.slug.startsWith("harbor-mobility-");
  const standardSlug = scopedSeed ? `${fleet.slug}-standard` : "independent-standard";
  const accessibleSlug = scopedSeed ? `${fleet.slug}-accessible` : "accessible-ride";
  const expectedServiceSlugs = mode === "minimal" ? [standardSlug] : [standardSlug, accessibleSlug];
  const [memberships, areas, services, policies, drivers, vehicles, paymentProviders] = await Promise.all([
    readRows(() => sudo.query.FleetMembership.findMany({
      where: { fleet: { id: { equals: fleetId } }, user: { id: { equals: userId } }, role: { equals: "owner" }, status: { equals: "active" } },
      orderBy: [{ id: "asc" }],
      take: 1,
      query: demoSeedInspectionSelections.membership
    })),
    readRows(() => sudo.query.ServiceArea.findMany({
      where: { fleet: { id: { equals: fleetId } }, status: { equals: "active" } },
      orderBy: [{ id: "asc" }],
      take: 25,
      query: demoSeedInspectionSelections.serviceArea
    })),
    readRows(() => sudo.query.RideService.findMany({
      where: { fleet: { id: { equals: fleetId } }, status: { equals: "active" }, slug: { in: expectedServiceSlugs } },
      orderBy: [{ id: "asc" }],
      take: expectedServiceSlugs.length,
      query: demoSeedInspectionSelections.service
    })),
    readRows(() => sudo.query.Policy.findMany({
      where: { fleet: { id: { equals: fleetId } }, kind: { in: ["driver_eligibility", "vehicle_eligibility"] }, status: { equals: "active" } },
      orderBy: [{ id: "asc" }],
      take: 2,
      query: demoSeedInspectionSelections.policy
    })),
    readRows(() => sudo.query.DriverProfile.findMany({
      where: { fleet: { id: { equals: fleetId } }, user: { id: { equals: userId } }, status: { equals: "active" } },
      orderBy: [{ id: "asc" }],
      take: 1,
      query: demoSeedInspectionSelections.driver
    })),
    readRows(() => sudo.query.Vehicle.findMany({
      where: { fleet: { id: { equals: fleetId } }, status: { equals: "active" } },
      orderBy: [{ id: "asc" }],
      take: 25,
      query: demoSeedInspectionSelections.vehicle
    })),
    readRows(() => context.query.PaymentProvider.findMany({
      where: { code: { equals: "pp_manual" } },
      orderBy: [{ id: "asc" }],
      take: 1,
      query: demoSeedInspectionSelections.paymentProvider
    }))
  ]);
  const readNames = [
    ["owner membership", memberships],
    ["active service areas", areas],
    ["active services and linked fare/area rows", services],
    ["active demo policy and evaluation fixtures", policies],
    ["active owner-linked demo driver and availability", drivers],
    ["active vehicles and driver links", vehicles],
    ["manual payment-provider fixture under existing finance List access", paymentProviders]
  ];
  for (const [name, result] of readNames) {
    if (!result.readable) missing.push(`${name} could not be verified`);
  }
  const ownerMembership = memberships.rows.some((row) => rowInFleet(row, fleetId) && row.user?.id === userId && row.role === "owner" && row.status === "active");
  if (memberships.readable && !ownerMembership) missing.push("active owner membership for the current user");
  const activeAreas = areas.rows.filter((row) => activeInFleet(row, fleetId) && typeof row.id === "string");
  if (areas.readable && activeAreas.length === 0) missing.push("active service area in the demo fleet");
  const activeAreaIds = new Set(activeAreas.map((row) => row.id));
  const activeServices = services.rows.filter((row) => activeInFleet(row, fleetId) && expectedServiceSlugs.includes(row.slug));
  for (const slug of expectedServiceSlugs) {
    const service = activeServices.find((row) => row.slug === slug);
    if (!services.readable || !service) {
      if (services.readable) missing.push(`active demo service '${slug}'`);
      continue;
    }
    const linkedAreaIds = new Set((Array.isArray(service.serviceAreas) ? service.serviceAreas : []).filter((area) => activeInFleet(area, fleetId) && activeAreaIds.has(area.id)).map((area) => area.id));
    if (linkedAreaIds.size === 0) missing.push(`active service-area relationship for '${slug}'`);
    const hasMatchingFare = (Array.isArray(service.fareRules) ? service.fareRules : []).some((fare) => fare.status === "active" && rowInFleet(fare, fleetId) && fare.service?.id === service.id && rowInFleet(fare.service, fleetId) && linkedAreaIds.has(fare.serviceArea?.id) && activeInFleet(fare.serviceArea, fleetId));
    if (linkedAreaIds.size > 0 && !hasMatchingFare) {
      missing.push(`active fare rule for '${slug}' linked to that same active service area and fleet`);
    }
  }
  const demoPolicy = policies.rows.find((row) => activeInFleet(row, fleetId) && row.name === "Demo driver and vehicle evidence policy" && row.kind === "driver_eligibility");
  if (policies.readable && !demoPolicy) missing.push("active demo driver/vehicle evidence policy");
  const demoDriver = drivers.rows.find((row) => activeInFleet(row, fleetId) && row.user?.id === userId);
  if (drivers.readable && !demoDriver) missing.push("active demo driver profile linked to the current user");
  const weekdayRules = Array.isArray(demoDriver?.availabilityRules) ? demoDriver.availabilityRules : [];
  const missingDays = [1, 2, 3, 4, 5].filter((day) => !weekdayRules.some((rule) => rule.status === "active" && rule.dayOfWeek === day));
  if (demoDriver && missingDays.length) missing.push(`active weekday availability fixtures for demo driver (missing days ${missingDays.join(", ")})`);
  const activeVehicles = vehicles.rows.filter((row) => activeInFleet(row, fleetId) && typeof row.id === "string");
  if (vehicles.readable && activeVehicles.length === 0) missing.push("active demo vehicle");
  const pairedVehicles = activeVehicles.filter((vehicle) => Array.isArray(vehicle.drivers) && vehicle.drivers.some((driver) => activeInFleet(driver, fleetId) && driver.id === demoDriver?.id));
  if (demoDriver && vehicles.readable && pairedVehicles.length === 0) missing.push("active vehicle-to-demo-driver relationship in the same fleet");
  if (demoDriver) {
    const documentBranches = [
      { driver: { id: { equals: demoDriver.id } } },
      ...pairedVehicles.map((vehicle) => ({ vehicle: { id: { equals: vehicle.id } } }))
    ];
    const documents = await readRows(() => context.query.ComplianceDocument.findMany({
      where: { OR: documentBranches },
      orderBy: [{ id: "asc" }],
      take: 25,
      query: demoSeedInspectionSelections.document
    }));
    if (!documents.readable) {
      missing.push("driver/vehicle document-kind metadata could not be verified under normal driver List access");
    } else {
      const driverDocuments = documents.rows.filter((row) => row.kind && row.driver?.id === demoDriver.id && rowInFleet(row.driver, fleetId));
      for (const kind of ["driver_license", "insurance"]) {
        if (!driverDocuments.some((row) => row.kind === kind)) {
          missing.push(`demo driver '${kind}' document record absent or not visible under existing driver List access`);
        }
      }
      for (const vehicle of pairedVehicles) {
        const vehicleDocuments = documents.rows.filter((row) => row.kind && row.vehicle?.id === vehicle.id && rowInFleet(row.vehicle, fleetId));
        for (const kind of ["vehicle_registration", "inspection"]) {
          if (!vehicleDocuments.some((row) => row.kind === kind)) {
            missing.push(`demo vehicle '${kind}' document record absent or not visible under existing driver List access`);
          }
        }
      }
    }
  }
  const policyEvaluations = demoPolicy && Array.isArray(demoPolicy.evaluations) ? demoPolicy.evaluations : [];
  if (demoPolicy && demoDriver && !policyEvaluations.some((evaluation) => evaluation.policy?.id === demoPolicy.id && rowInFleet(evaluation.policy, fleetId) && evaluation.driver?.id === demoDriver.id && activeInFleet(evaluation.driver, fleetId))) {
    missing.push("demo driver policy-evaluation fixture relationship");
  }
  const vehiclePolicy = policies.rows.find((row) => activeInFleet(row, fleetId) && row.kind === "vehicle_eligibility");
  const vehicleEvaluations = Array.isArray(vehiclePolicy?.evaluations) ? vehiclePolicy.evaluations : [];
  if (pairedVehicles.length && !pairedVehicles.some((vehicle) => vehicleEvaluations.some((evaluation) => evaluation.policy?.id === vehiclePolicy?.id && rowInFleet(evaluation.policy, fleetId) && evaluation.vehicle?.id === vehicle.id && activeInFleet(evaluation.vehicle, fleetId)))) {
    missing.push("demo vehicle policy-evaluation fixture relationship");
  }
  if (mode === "full") {
    const accessibleService = activeServices.find((row) => row.slug === accessibleSlug && row.wheelchairAccessible === true);
    const accessibleVehicle = accessibleService && pairedVehicles.some((vehicle) => vehicle.wheelchairAccessible === true && typeof vehicle.capacity === "number" && typeof accessibleService.passengerCapacity === "number" && vehicle.capacity >= accessibleService.passengerCapacity);
    if (accessibleService && !accessibleVehicle) missing.push("active wheelchair-capable vehicle linked to the demo driver for the accessible service fixture");
  }
  if (fleet && !hasExpectedProviderFixtures(fleet.providers)) {
    missing.push("all four fleet-scoped demo provider-configuration fixtures (mapping, notification, identity, background-check)");
  }
  const registration = fleet.marketplaceRegistration;
  if (!registration || !["source-openfront-rideshare-local", `source-rideshare-${fleetId}`].includes(registration.sourceId) || registration.platform !== "openfront-rideshare" || registration.status !== "active" || registration.manifestVersion !== "1") {
    missing.push("active source Marketplace registration fixture");
  }
  const manualProvider = paymentProviders.rows.find((row) => row.code === "pp_manual");
  if (paymentProviders.readable && !hasManualPaymentFixture(manualProvider)) {
    missing.push("manual payment-provider configuration is absent, incomplete, or not visible under existing finance List access");
  }
  return makeDiagnostic(mode, [...new Set(missing)], limitations);
}
function hasExpectedProviderFixtures(value) {
  if (!Array.isArray(value)) return false;
  const expected = [
    ["mapping", "manual", "sandbox"],
    ["notification", "console", "sandbox"],
    ["identity", "manual", "unconfigured"],
    ["background_check", "manual", "unconfigured"]
  ];
  return expected.every(([kind, adapter, status]) => value.some((row) => row.kind === kind && row.adapter === adapter && row.status === status));
}
function hasManualPaymentFixture(row) {
  return row?.code === "pp_manual" && row.isInstalled === "yes" && row.createPaymentFunction === "manual" && row.capturePaymentFunction === "manual" && row.refundPaymentFunction === "manual" && row.getPaymentStatusFunction === "manual" && row.handleWebhookFunction === "manual";
}
function makeDiagnostic(mode, missing, limitations) {
  const setupComplete = missing.length === 0;
  return {
    mode,
    setupComplete,
    onboardingStatus: setupComplete ? "completed" : "in_progress",
    missing,
    limitations,
    message: setupComplete ? "Existing demo fixture structure passed bounded source checks; no operational readiness is implied." : "Existing demo fixture completeness is missing or unverified. Onboarding remains in progress; this check did not repair or create records."
  };
}

// features/keystone/mutations/onboarding.ts
function requestBaseUrl(req) {
  const header = (name) => String(req?.headers?.[name] || "").split(",")[0].trim();
  const host = header("x-forwarded-host") || header("host");
  return host ? `${header("x-forwarded-proto") || "https"}://${host}` : "";
}
async function dismissRideshareOnboarding(_root, _args, context) {
  return context.prisma.$transaction(async (tx) => {
    const actorId = await currentRiderId(tx, context.session);
    if (!actorId) return false;
    const user = await tx.user.findUnique({ where: { id: actorId }, select: { onboardingStatus: true } });
    if (!user || user.onboardingStatus === "completed") return false;
    if (user.onboardingStatus === "dismissed") return true;
    const result = await tx.user.updateMany({ where: { id: actorId, onboardingStatus: user.onboardingStatus }, data: { onboardingStatus: "dismissed" } });
    return result.count === 1;
  }, { isolationLevel: "Serializable" });
}
async function bootstrapRideshare(_root, args, context) {
  if (process.env.NODE_ENV === "production") throw new Error("Demonstration onboarding is disabled in production.");
  if (!context.session?.itemId || !await permissions.canManageOnboarding({ context, session: context.session })) throw new Error("Onboarding permission is required.");
  if (args.mode !== "minimal" && args.mode !== "full") throw new Error("Demo setup mode must be minimal or full.");
  const userId = context.session.itemId;
  const demoSlug = `harbor-mobility-${userId}`;
  const demoFleetWhere = { OR: [{ slug: { equals: demoSlug } }, { slug: { equals: "harbor-independent-mobility" }, memberships: { some: { user: { id: { equals: userId } }, role: { equals: "owner" }, status: { equals: "active" } } } }] };
  const sudo = context.sudo();
  const existing = await sudo.query.Fleet.findMany({ where: demoFleetWhere, take: 1, query: "id" });
  if (existing[0]) {
    if (!await canAccessFleet(context, context.session, existing[0].id, "fleetAdmin")) throw new Error("Fleet setup is unavailable.");
    existing[0] = await sudo.query.Fleet.findOne({ where: { id: existing[0].id }, query: demoSeedInspectionSelections.fleet });
    const diagnostic = await inspectExistingDemoFleet(sudo, context, existing[0], userId, args.mode);
    await sudo.query.User.updateOne({ where: { id: userId }, data: { onboardingStatus: diagnostic.onboardingStatus } });
    return { fleetId: existing[0].id, created: false, summary: diagnostic };
  }
  await sudo.query.User.updateOne({ where: { id: userId }, data: { onboardingStatus: "in_progress" } });
  return context.transaction(async (transactionContext) => {
    if (!await permissions.canManageOnboarding({ context: transactionContext, session: context.session })) throw new Error("Onboarding permission is required.");
    await transactionContext.prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`setup:${userId}`}, 0))::text IS NOT NULL`;
    const transactionSudo = transactionContext.sudo();
    const racedFleet = await transactionSudo.query.Fleet.findMany({ where: demoFleetWhere, take: 1, query: "id" });
    if (racedFleet[0]) {
      if (!await canAccessFleet(transactionContext, context.session, racedFleet[0].id, "fleetAdmin")) throw new Error("Fleet setup is unavailable.");
      racedFleet[0] = await transactionSudo.query.Fleet.findOne({ where: { id: racedFleet[0].id }, query: demoSeedInspectionSelections.fleet });
      const diagnostic2 = await inspectExistingDemoFleet(transactionSudo, transactionContext, racedFleet[0], userId, args.mode);
      await transactionSudo.query.User.updateOne({ where: { id: userId }, data: { onboardingStatus: diagnostic2.onboardingStatus } });
      return { fleetId: racedFleet[0].id, created: false, summary: diagnostic2 };
    }
    const full = args.mode === "full";
    const fleet = await transactionSudo.query.Fleet.createOne({ data: { name: "Harbor Independent Mobility", logoIcon: DEFAULT_STORE_LOGO_ICON, logoColor: DEFAULT_STORE_LOGO_COLOR, slug: demoSlug, status: "active", publicDescription: "A driver-owned cooperative serving central neighborhoods with transparent source-owned pricing.", publicCity: "Harbor City", countryCode: "US", currencyCode: "USD", timezone: "America/New_York", supportEmail: "support@example.invalid", preciseLocationRetentionDays: "30" }, query: "id" });
    await transactionSudo.query.FleetMembership.createOne({ data: { fleet: { connect: { id: fleet.id } }, user: { connect: { id: userId } }, role: "owner", status: "active", acceptedAt: /* @__PURE__ */ new Date() } });
    const area = await transactionSudo.query.ServiceArea.createOne({ data: { fleet: { connect: { id: fleet.id } }, name: "Harbor City Core", publicRegionLabel: "Harbor City central neighborhoods", countryCode: "US", status: "active", coarseBounds: { disclosure: "Coarse public service region; exact driver locations are not published." } }, query: "id" });
    const service = await transactionSudo.query.RideService.createOne({ data: { fleet: { connect: { id: fleet.id } }, serviceAreas: { connect: [{ id: area.id }] }, name: "Independent Standard", slug: `${demoSlug}-standard`, description: "Everyday rides from locally operated independent drivers.", status: "active", category: "standard", passengerCapacity: 4, advanceBookingMinutes: 30 }, query: "id" });
    const accessible = full ? await transactionSudo.query.RideService.createOne({ data: { fleet: { connect: { id: fleet.id } }, serviceAreas: { connect: [{ id: area.id }] }, name: "Accessible Ride", slug: `${demoSlug}-accessible`, description: "Wheelchair-accessible service when an eligible vehicle is available.", status: "active", category: "accessible", passengerCapacity: 4, wheelchairAccessible: true, advanceBookingMinutes: 120 }, query: "id" }) : null;
    for (const target of [service, accessible].filter(Boolean)) {
      await transactionSudo.query.FareRule.createOne({ data: { fleet: { connect: { id: fleet.id } }, service: { connect: { id: target.id } }, serviceArea: { connect: { id: area.id } }, name: `${target.id === service.id ? "Standard" : "Accessible"} transparent fare`, version: 1, status: "active", currencyCode: "USD", baseFareMinor: 350, perDistanceUnitMinor: 185, distanceUnit: "mile", perMinuteMinor: 35, bookingFeeMinor: 100, minimumFareMinor: 850, cancellationFeeMinor: 500, noShowFeeMinor: 900, maximumMultiplierBasisPoints: 1e4, rules: { dynamicPricingEnabled: false } } });
    }
    const policy = await transactionSudo.query.Policy.createOne({ data: { fleet: { connect: { id: fleet.id } }, name: "Demo driver and vehicle evidence policy", version: "2026-demo-1", jurisdiction: "Example only \u2014 deployer must replace", kind: "driver_eligibility", status: "active", requirements: { requiredEvidence: ["driver_license", "insurance", "vehicle_registration", "inspection"], manualReviewRequired: true }, evidenceSources: [{ source: "operator review", authoritative: false }], disclaimer: "Demo evidence policy only. This does not establish legal eligibility, approval, insurance coverage, or background-check clearance." }, query: "id" });
    const vehiclePolicy = await transactionSudo.query.Policy.createOne({ data: { fleet: { connect: { id: fleet.id } }, name: "Demonstration vehicle evidence policy", version: "2026-demo-1", kind: "vehicle_eligibility", status: "active", requirements: { demonstrationOnly: true }, evidenceSources: [{ authoritative: false }], disclaimer: "Demonstration metadata; no inspection, insurance or legal approval." }, query: "id" });
    const driver = await transactionSudo.query.DriverProfile.createOne({ data: { fleet: { connect: { id: fleet.id } }, user: { connect: { id: userId } }, publicName: "Maya R.", publicBio: "Independent local driver and cooperative member.", status: "active", dispatchStatus: "available", acceptsScheduled: true, languages: ["English", "Spanish"] }, query: "id" });
    const vehicle = await transactionSudo.query.Vehicle.createOne({ data: { fleet: { connect: { id: fleet.id } }, drivers: { connect: [{ id: driver.id }] }, label: "Blue 2022 Hybrid", make: "Example", model: "Hybrid Sedan", year: 2022, color: "Blue", plateMasked: "\u2022\u2022\u2022 482", capacity: 4, wheelchairAccessible: full, status: "active" }, query: "id" });
    const evalExpiry = new Date(Date.now() + 90 * 24 * 60 * 6e4);
    await transactionSudo.query.PolicyEvaluation.createOne({ data: { policy: { connect: { id: policy.id } }, driver: { connect: { id: driver.id } }, outcome: "eligible", reasons: ["Demo operator review recorded; not a legal determination."], evidenceSnapshot: { policyVersion: "2026-demo-1", authoritative: false, kind: "demonstration" }, evaluatedAt: /* @__PURE__ */ new Date(), expiresAt: evalExpiry, evaluator: { connect: { id: userId } } } });
    await transactionSudo.query.PolicyEvaluation.createOne({ data: { policy: { connect: { id: vehiclePolicy.id } }, vehicle: { connect: { id: vehicle.id } }, outcome: "eligible", reasons: ["Demo vehicle evidence review recorded; not an inspection certification."], evidenceSnapshot: { policyVersion: "2026-demo-1", authoritative: false, kind: "demonstration" }, evaluatedAt: /* @__PURE__ */ new Date(), expiresAt: evalExpiry, evaluator: { connect: { id: userId } } } });
    for (const dayOfWeek of [1, 2, 3, 4, 5]) {
      await transactionSudo.query.AvailabilityRule.createOne({ data: { driver: { connect: { id: driver.id } }, dayOfWeek, startTime: "07:00", endTime: "19:00", timezone: "America/New_York", status: "active" } });
    }
    await transactionContext.prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"provider:pp_manual"}, 0))::text IS NOT NULL`;
    const manualProvider = await transactionSudo.query.PaymentProvider.findOne({ where: { code: "pp_manual" }, query: "id" });
    if (!manualProvider) await transactionSudo.query.PaymentProvider.createOne({ data: { name: "Manual development ledger", code: "pp_manual", isInstalled: "yes", createPaymentFunction: "manual", capturePaymentFunction: "manual", refundPaymentFunction: "manual", getPaymentStatusFunction: "manual", handleWebhookFunction: "manual", metadata: { disclosure: "Records payment evidence only; does not move money." } } });
    for (const [name, kind, adapter] of [["Manual route estimate", "mapping", "manual"], ["Console notifications", "notification", "console"], ["Unconfigured identity evidence", "identity", "manual"], ["Unconfigured background-check evidence", "background_check", "manual"]]) {
      await transactionSudo.query.ProviderConnection.createOne({ data: { fleet: { connect: { id: fleet.id } }, name, kind, adapter, status: kind === "mapping" || kind === "notification" ? "sandbox" : "unconfigured", capabilities: [], evidencePolicyUrl: "https://example.invalid/provider-policy" } });
    }
    await transactionSudo.query.MarketplaceRegistration.createOne({ data: { fleet: { connect: { id: fleet.id } }, sourceId: `source-rideshare-${fleet.id}`, platform: "openfront-rideshare", status: "active", manifestVersion: "1", publicBaseUrl: requestBaseUrl(context.req), capabilities: ["marketplace.discovery", "rideshare.quote", "rideshare.request", "rideshare.trip.view"], verificationEvidence: { localContractTestsRequired: true } } });
    const persistedFleet = await transactionSudo.query.Fleet.findOne({ where: { id: fleet.id }, query: demoSeedInspectionSelections.fleet });
    const diagnostic = await inspectExistingDemoFleet(transactionSudo, transactionContext, persistedFleet, userId, args.mode);
    await transactionSudo.query.User.updateOne({ where: { id: userId }, data: { onboardingStatus: diagnostic.onboardingStatus } });
    return { fleetId: fleet.id, created: true, summary: diagnostic };
  });
}

// features/keystone/mutations/accountViews.ts
async function myDriverWorkspace(_root, args, context) {
  return context.prisma.$transaction(async (tx) => {
    const actorId = await currentRiderId(tx, context.session);
    if (!actorId) throw new Error("A current driver account session is required.");
    const driver = await tx.driverProfile.findFirst({ where: { userId: actorId }, select: { id: true, userId: true, fleetId: true, publicName: true, status: true, dispatchStatus: true, fleet: { select: { operationsMode: true } } } });
    const readiness = rideReadiness(driver?.fleet?.operationsMode);
    const empty = { actorId, driver: driver ? { id: driver.id, publicName: driver.publicName, status: driver.status, dispatchStatus: driver.dispatchStatus } : null, offers: [], trips: [], offersNextCursor: null, tripsNextCursor: null, actionsEnabled: false, actionsBlockedReason: "An active fleet-linked driver profile is required." };
    if (!driver?.fleetId || driver.status !== "active") return empty;
    const scope = JSON.stringify([actorId, driver.fleetId, driver.id]);
    const offerBoundary = decodeKeyset(args?.offersCursor, "driver_offers", scope);
    const tripBoundary = decodeKeyset(args?.tripsCursor, "driver_trips", scope);
    const [offerRows, tripRows] = await Promise.all([
      tx.matchOffer.findMany({
        where: {
          driverId: driver.id,
          driver: { is: { userId: actorId, fleetId: driver.fleetId, status: "active" } },
          request: { is: { fleetId: driver.fleetId } },
          vehicle: { is: { fleetId: driver.fleetId } },
          status: "offered",
          expiresAt: { gt: /* @__PURE__ */ new Date() },
          ...offerBoundary ? { OR: offerBoundary.time ? [{ offeredAt: { lt: new Date(offerBoundary.time) } }, { offeredAt: new Date(offerBoundary.time), id: { lt: offerBoundary.id } }, { offeredAt: null }] : [{ offeredAt: null, id: { lt: offerBoundary.id } }] } : {}
        },
        orderBy: [{ offeredAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
        take: 26,
        select: { id: true, status: true, offeredAt: true, expiresAt: true, request: { select: { id: true, requestNumber: true, requestedFor: true, passengerCount: true, pickupLabel: true, dropoffLabel: true } }, vehicle: { select: { id: true, label: true, make: true, model: true, color: true, plateMasked: true } } }
      }),
      tx.trip.findMany({
        where: {
          driverId: driver.id,
          fleetId: driver.fleetId,
          driver: { is: { userId: actorId, fleetId: driver.fleetId, status: "active" } },
          vehicle: { is: { fleetId: driver.fleetId } },
          status: { in: ["driver_assigned", "driver_en_route", "driver_arrived", "in_progress"] },
          ...tripBoundary ? { OR: tripBoundary.time ? [{ scheduledFor: { gt: new Date(tripBoundary.time) } }, { scheduledFor: new Date(tripBoundary.time), id: { gt: tripBoundary.id } }] : [{ scheduledFor: null, id: { gt: tripBoundary.id } }, { scheduledFor: { not: null } }] } : {}
        },
        orderBy: [{ scheduledFor: { sort: "asc", nulls: "first" } }, { id: "asc" }],
        take: 26,
        select: { id: true, acceptedOfferId: true, confirmationCode: true, status: true, scheduledFor: true, pickupLabel: true, dropoffLabel: true, vehicle: { select: { id: true, label: true, plateMasked: true } } }
      })
    ]);
    const next = (rows, purpose, field) => rows.length > 25 ? encodeKeyset(purpose, scope, { id: rows[24].id, time: rows[24][field]?.toISOString() || null }) : null;
    return { ...empty, offers: offerRows.slice(0, 25), trips: tripRows.slice(0, 25), offersNextCursor: next(offerRows, "driver_offers", "offeredAt"), tripsNextCursor: next(tripRows, "driver_trips", "scheduledFor"), actionsEnabled: readiness.bookingEnabled, actionsBlockedReason: readiness.bookingEnabled ? null : OPERATIONS_OFF_MESSAGE };
  }, { isolationLevel: "RepeatableRead" });
}
async function myRideshareTrips(_root, _args, context) {
  const history = await myRideshareRequests(_root, {}, context);
  return history.items.filter((item) => item.trip).map((item) => ({ ...item.trip, createdAt: item.createdAt }));
}

// features/keystone/mutations/operatorHandoffs.ts
async function operatorTripHandoff(_root, args, context) {
  if (!humanSessionId(context.session) || typeof args.tripId !== "string" || !args.tripId || args.tripId.length > 200) return null;
  return context.prisma.$transaction(async (tx) => {
    await fenceHumanAuthority(tx, context.session);
    const authority = await authorizedTripHeader(tx, context.session, args.tripId, "operator");
    if (!authority) return null;
    const scope = JSON.stringify([authority.actorId, authority.header.fleetId, authority.header.id, authority.header.acceptedOfferId]);
    const boundary = decodeKeyset(args.cursor, "operator_trip_events", scope);
    if (boundary && boundary.time === null) throw new Error("Invalid event page cursor.");
    if (!authority.bound) {
      const state = await tx.trip.findFirst({ where: authority.header, select: { id: true, status: true } });
      return state ? { available: false, tripId: state.id, status: state.status, requestId: null, requestNumber: null, requestStatus: null, acceptedOfferId: null, events: [], historyTruncated: false } : null;
    }
    const trip = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), include: {
      request: { include: { quote: { include: { service: { select: { fleetId: true } } } } } },
      acceptedOffer: true,
      events: { where: boundary ? { OR: [{ occurredAt: { lt: new Date(boundary.time) } }, { occurredAt: new Date(boundary.time), id: { lt: boundary.id } }] } : {}, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 101 }
    } });
    if (!trip) return null;
    const request = trip.request;
    const available = Boolean(request && hasRequestTripBinding(request, trip));
    const history = available ? projectRiderTrip(trip) : null;
    return {
      available,
      tripId: trip.id,
      status: trip.status,
      requestId: available ? request.id : null,
      requestNumber: available ? request.requestNumber : null,
      requestStatus: available ? request.status : null,
      acceptedOfferId: available ? trip.acceptedOfferId : null,
      events: history?.events || [],
      historyTruncated: history?.historyTruncated || false,
      nextCursor: available && trip.events.length > 100 ? encodeKeyset("operator_trip_events", scope, { id: trip.events[99].id, time: trip.events[99].occurredAt.toISOString() }) : null
    };
  }, { isolationLevel: "RepeatableRead" });
}

// features/keystone/mutations/riderTripHistory.ts
async function riderTripHistory(_root, args, context) {
  if (!["events", "payments", "reviews"].includes(args.kind)) throw new Error("Unknown history kind.");
  return context.prisma.$transaction(async (tx) => {
    const header = await authorizedRequestHeader(tx, context.session, args.requestId, args.requestProof);
    if (!header) return null;
    const request = await tx.rideRequest.findFirst({ where: requestOwnerWhere(header), include: {
      quote: { select: { id: true, publicId: true, requestId: true, service: { select: { fleetId: true } } } },
      trip: { include: { acceptedOffer: true } }
    } });
    if (!request?.trip || !hasRequestTripBinding(request, request.trip)) return null;
    const trip = request.trip;
    const scope = JSON.stringify([header.riderId || "guest", header.fleetId, header.id, trip.id, trip.acceptedOfferId]);
    const purpose = `rider_trip_${args.kind}`;
    const boundary = decodeKeyset(args.cursor, purpose, scope);
    const field = args.kind === "events" ? "occurredAt" : args.kind === "payments" ? "createdAt" : "submittedAt";
    const where = { tripId: trip.id, ...args.kind === "reviews" ? { status: "published" } : {}, ...boundary ? boundary.time === null ? { [field]: null, id: { lt: boundary.id } } : { OR: [{ [field]: { lt: new Date(boundary.time) } }, { [field]: new Date(boundary.time), id: { lt: boundary.id } }, { [field]: null }] } : {} };
    const select9 = args.kind === "events" ? { id: true, eventType: true, fromStatus: true, toStatus: true, occurredAt: true } : args.kind === "payments" ? { id: true, amountMinor: true, currencyCode: true, status: true, createdAt: true } : { id: true, direction: true, rating: true, body: true, status: true, submittedAt: true };
    const model = args.kind === "events" ? tx.tripEvent : args.kind === "payments" ? tx.payment : tx.review;
    const limit = args.kind === "events" ? 100 : 20;
    const rows = await model.findMany({ where, orderBy: [{ [field]: { sort: "desc", nulls: "last" } }, { id: "desc" }], take: limit + 1, select: select9 });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return { requestId: header.id, tripId: trip.id, kind: args.kind, items, nextCursor: rows.length > limit ? encodeKeyset(purpose, scope, { id: last.id, time: last[field]?.toISOString() || null }) : null };
  }, { isolationLevel: "RepeatableRead" });
}

// features/keystone/mutations/dispatchCandidates.ts
async function dispatchCandidatePage(_root, args, context) {
  const actorId = humanSessionId(context.session);
  if (!actorId) return null;
  const query = args.query?.trim() || "";
  if (query.length > 100) throw new Error("Candidate search is too long.");
  return context.prisma.$transaction(async (tx) => {
    const header = await tx.rideRequest.findUnique({ where: { id: args.requestId }, select: { id: true, fleetId: true } });
    if (!header?.fleetId) return null;
    await fenceHumanAuthority(tx, context.session, header.fleetId);
    if (!await canAccessFleet({ prisma: tx }, context.session, header.fleetId, "operations")) return null;
    const request = await tx.rideRequest.findFirst({ where: header, select: { id: true, status: true, requestedFor: true, passengerCount: true, accessibilityNeeds: true, quote: { select: { service: { select: { status: true, fleetId: true, passengerCapacity: true, wheelchairAccessible: true } } } } } });
    if (!request) return null;
    const now = /* @__PURE__ */ new Date();
    const service = request.quote?.service;
    const fleet = await tx.fleet.findUnique({ where: { id: header.fleetId }, select: { status: true } });
    const scope = JSON.stringify([actorId, header.fleetId, header.id, query]);
    const boundary = decodeKeyset(args.cursor, "dispatch_pairs", scope);
    let after = null;
    if (boundary) {
      try {
        after = JSON.parse(boundary.id);
      } catch {
        throw new Error("Invalid candidate cursor.");
      }
      if (boundary.time !== null || !Array.isArray(after) || after.length !== 2 || typeof after[0] !== "string" || !after[0] || after[1] !== null && (typeof after[1] !== "string" || !after[1])) throw new Error("Invalid candidate cursor.");
    }
    const base = { requestId: header.id, actorId, evaluatedAt: now.toISOString(), items: [], nextCursor: null };
    const scheduled = Boolean(request.requestedFor);
    if (!["requested", "matching"].includes(request.status) || fleet?.status !== "active" || !service || service.status !== "active" || service.fleetId !== header.fleetId || scheduled && !isFutureScheduledRequest(request.requestedFor, now)) return { ...base, blockedReason: "The request or its service is unavailable for a new offer." };
    const at = scheduled ? new Date(request.requestedFor) : now;
    const needs = request.accessibilityNeeds && typeof request.accessibilityNeeds === "object" ? request.accessibilityNeeds : {};
    if (!Number.isSafeInteger(request.passengerCount) || request.passengerCount < 1 || request.passengerCount > service.passengerCapacity) return { ...base, blockedReason: "Passenger capacity evidence is unavailable." };
    const drivers = await tx.driverProfile.findMany({ where: {
      fleetId: header.fleetId,
      status: "active",
      dispatchStatus: { in: scheduled ? ["available", "offered", "assigned", "on_trip"] : ["available"] },
      ...scheduled ? { acceptsScheduled: true } : {},
      ...query ? { OR: [{ id: query }, { publicName: { contains: query, mode: "insensitive" } }] } : {},
      ...after ? { id: { [after[1] === null ? "gt" : "gte"]: after[0] } } : {}
    }, orderBy: { id: "asc" }, take: 11, select: { id: true, publicName: true } });
    const cursor = (driverId, vehicleId) => encodeKeyset("dispatch_pairs", scope, { id: JSON.stringify([driverId, vehicleId]), time: null });
    for (const driver of drivers.slice(0, 10)) {
      if (!await loadCurrentEligibility(tx, "driver", driver.id, header.fleetId, now) || !await isCurrentlyAvailableAt(tx, driver.id, at)) {
        base.nextCursor = cursor(driver.id, null);
        continue;
      }
      const vehicles = await tx.vehicle.findMany({ where: {
        fleetId: header.fleetId,
        status: "active",
        drivers: { some: { id: driver.id, fleetId: header.fleetId } },
        capacity: { gte: request.passengerCount },
        ...needs.wheelchairAccessible === true || service.wheelchairAccessible ? { wheelchairAccessible: true } : {},
        ...after && after[0] === driver.id && after[1] ? { id: { gt: after[1] } } : {}
      }, orderBy: { id: "asc" }, take: 26, select: { id: true, label: true, capacity: true } });
      for (const vehicle of vehicles.slice(0, 25)) {
        base.nextCursor = cursor(driver.id, vehicle.id);
        if (!await loadCurrentEligibility(tx, "vehicle", vehicle.id, header.fleetId, now)) continue;
        const liveOffer = await tx.matchOffer.findFirst({ where: { requestId: request.id, OR: [{ status: "accepted" }, { status: "offered", expiresAt: { gt: now }, OR: [{ driverId: driver.id }, { vehicleId: vehicle.id }] }] }, select: { id: true } });
        if (liveOffer) continue;
        base.items.push({ driverId: driver.id, driverName: driver.publicName, vehicleId: vehicle.id, vehicleLabel: vehicle.label, capacity: vehicle.capacity });
        if (base.items.length === 20) return { ...base, blockedReason: null };
      }
      if (vehicles.length > 25) return { ...base, blockedReason: null };
      base.nextCursor = cursor(driver.id, null);
    }
    if (drivers.length <= 10) base.nextCursor = null;
    return { ...base, blockedReason: null };
  }, { isolationLevel: "RepeatableRead" });
}

// features/keystone/mutations/index.ts
var graphql = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({ schemas: [baseSchema], typeDefs: graphql`
    type MarketplaceFleet { logoIcon: String, logoColor: String, id: ID!, name: String!, publicDescription: String, publicCity: String, countryCode: String }
    type RideshareExtension { schema: String!, value: JSON! }
    type RideReadiness { bookingEnabled: Boolean!, mode: String!, reason: String! }
    type OfferMaintenanceResult { releasedCount: Int!, hasMore: Boolean! }
    type PublicServiceArea { id: ID!, name: String!, publicRegionLabel: String!, countryCode: String }
    type PublicServiceAreaPage { items: [PublicServiceArea!]!, nextCursor: ID }
    type MarketplaceRideshareService { nextCursor: String, areasTruncated: Boolean!, id: ID!, title: String!, description: String, category: String!, passengerCapacity: Int!, wheelchairAccessible: Boolean!, advanceBookingMinutes: Int!, publicRegionLabels: [String!]!, fleet: MarketplaceFleet!, startingFareMinor: Int, currencyCode: String!, extension: RideshareExtension!, readiness: RideReadiness! }
    type FareBreakdown { currencyCode: String!, baseFareMinor: Int!, distanceMinor: Int!, durationMinor: Int!, bookingFeeMinor: Int!, multiplierBasisPoints: Int!, subtotalMinor: Int!, totalMinor: Int! }
    type MarketplaceRideQuote { quoteId: ID!, quoteProof: String!, expiresAt: DateTime!, pickupLabel: String!, dropoffLabel: String!, scheduledFor: DateTime, estimatedDistanceMeters: Int!, estimatedDurationSeconds: Int!, cancellationFeeMinor: Int!, noShowFeeMinor: Int!, fare: FareBreakdown!, estimateDisclosure: String!, sourceCheckoutPath: String! }
    type RideRequestReceipt { requestId: ID!, requestNumber: String!, status: String!, requestProof: String!, replayed: Boolean! }
    type RideIntentResolution { kind: String!, quoteId: ID!, receipt: RideRequestReceipt }
    type RideRequestCancellation { requestId: ID!, status: String!, replayed: Boolean!, alreadyCancelled: Boolean! }
    type PublicRequestTrip { fleetBrand: JSON, id: ID!, historyTruncated: Boolean!, confirmationCode: String!, status: String!, scheduledFor: DateTime, acceptedAt: DateTime, enRouteAt: DateTime, arrivedAt: DateTime, startedAt: DateTime, completedAt: DateTime, cancelledAt: DateTime, pickupLabel: String, dropoffLabel: String, bookingSnapshot: JSON!, finalFareSnapshot: JSON, events: [PublicTripEvent!]!, payments: [PublicTripPayment!]!, reviews: [PublicTripReview!]! }
    type PublicRideshareRequest { fleetBrand: JSON, requestId: ID!, requestNumber: String!, status: String!, requestedFor: DateTime, pickupLabel: String, dropoffLabel: String, createdAt: DateTime!, handoffState: String!, trip: PublicRequestTrip }
    type RiderRequestHistory { items: [PublicRideshareRequest!]!, nextCursor: ID }
    type OperatorTripHandoff { available: Boolean!, tripId: ID!, status: String!, requestId: ID, requestNumber: String, requestStatus: String, acceptedOfferId: ID, historyTruncated: Boolean!, events: [PublicTripEvent!]!, nextCursor: String }
    type RideOfferResponse { accepted: Boolean!, requestId: ID!, tripId: ID, confirmationCode: String, tripToken: String }
    type RideshareBootstrapResult { fleetId: ID!, created: Boolean!, summary: JSON! }
    type PublicTripEvent { eventType: String!, fromStatus: String, toStatus: String, occurredAt: DateTime! }
    type PublicTripPayment { amountMinor: Int, currencyCode: String, status: String }
    type PublicTripReview { direction: String, rating: Int, body: String, status: String, submittedAt: DateTime }
    type PublicRideshareTrip { requestId: ID!, fleetBrand: JSON, id: ID!, historyTruncated: Boolean!, confirmationCode: String!, status: String!, scheduledFor: DateTime, acceptedAt: DateTime, enRouteAt: DateTime, arrivedAt: DateTime, startedAt: DateTime, completedAt: DateTime, cancelledAt: DateTime, pickupLabel: String, dropoffLabel: String, bookingSnapshot: JSON!, finalFareSnapshot: JSON, events: [PublicTripEvent!]!, payments: [PublicTripPayment!]!, reviews: [PublicTripReview!]! }
    type DriverWorkspaceDriver { id: ID!, publicName: String!, status: String, dispatchStatus: String }
    type DriverWorkspaceRequest { id: ID!, requestNumber: String!, requestedFor: DateTime, passengerCount: Int, pickupLabel: String, dropoffLabel: String }
    type DriverWorkspaceVehicle { id: ID!, label: String!, make: String, model: String, color: String, plateMasked: String }
    type DriverWorkspaceOffer { id: ID!, status: String!, offeredAt: DateTime, expiresAt: DateTime!, request: DriverWorkspaceRequest, vehicle: DriverWorkspaceVehicle }
    type DriverWorkspaceTripVehicle { id: ID!, label: String!, plateMasked: String }
    type DriverWorkspaceTrip { acceptedOfferId: ID, id: ID!, confirmationCode: String!, status: String!, scheduledFor: DateTime, pickupLabel: String, dropoffLabel: String, vehicle: DriverWorkspaceTripVehicle }
    type DriverWorkspace { actorId: ID!, offersNextCursor: String, tripsNextCursor: String, driver: DriverWorkspaceDriver, offers: [DriverWorkspaceOffer!]!, trips: [DriverWorkspaceTrip!]!, actionsEnabled: Boolean!, actionsBlockedReason: String }
    type RiderTripSummary { id: ID!, confirmationCode: String!, status: String!, scheduledFor: DateTime, pickupLabel: String, dropoffLabel: String, bookingSnapshot: JSON!, finalFareSnapshot: JSON, createdAt: DateTime! }
    type Query {
      redirectToInit: Boolean
      marketplaceRideshareServices(query: String, location: String, limit: Int, after: String): [MarketplaceRideshareService!]!
      marketplaceRideshareService(id: ID!): MarketplaceRideshareService
      marketplaceRideshareServiceAreas(serviceId: ID!, after: ID): PublicServiceAreaPage!
      publicRideshareTrip(confirmationCode: String!, tripToken: String, requestId: ID, requestProof: String): PublicRideshareTrip
      riderRequestStatus(requestId: ID!, requestProof: String): PublicRideshareRequest
      myRideshareRequests(cursor: ID): RiderRequestHistory!
      operatorTripHandoff(tripId: ID!, cursor: String): OperatorTripHandoff
      publicRideshareRequest(requestId: ID!, requestProof: String!): PublicRideshareRequest
      myDriverWorkspace(offersCursor: String, tripsCursor: String): DriverWorkspace!
      myRideshareTrips: [RiderTripSummary!]!
      safetyQueueScope: Boolean!
      financeQueueScope: Boolean!
      rideshareCapabilities: JSON!
      riderAccountOptions: JSON!
      fleetBranding(fleetId: ID!): JSON
      tripCancellationPreview(tripId: ID!): JSON
      riderRequestCancellationPreview(requestId: ID!, requestProof: String): JSON
      riderTripHistory(requestId: ID!, requestProof: String, kind: String!, cursor: String): JSON
      dispatchCandidatePage(requestId: ID!, cursor: String, query: String): JSON
      dispatchQueueScope: Boolean!
    }
    type Mutation {
      marketplaceRideshareQuote(serviceId: ID!, pickupLabel: String!, dropoffLabel: String!, scheduledFor: DateTime, passengerCount: Int, wheelchairAccessible: Boolean, handoffId: String): MarketplaceRideQuote!
      requestRide(quoteId: ID!, quoteProof: String!, passengerCount: Int, accessibilityNeeds: JSON, riderNotes: String, preciseRouteEncryptedRef: String): RideRequestReceipt!
      resolveRideRequestIntent(quoteId: ID!, quoteProof: String!, passengerCount: Int, accessibilityNeeds: JSON, riderNotes: String, preciseRouteEncryptedRef: String): RideIntentResolution!
      offerRideToDriver(requestId: ID!, driverId: ID!, vehicleId: ID!, expiresInSeconds: Int, idempotencyKey: String!, expectedActorId: ID!): MatchOffer!
      respondToRideOffer(offerId: ID!, response: String!, reason: String, idempotencyKey: String!): RideOfferResponse!
      transitionTrip(tripId: ID!, action: String!, reason: String, idempotencyKey: String!, expectedActorId: ID!, expectedAcceptedOfferId: ID!): Trip!
      cancelRideRequest(requestId: ID!, requestProof: String, idempotencyKey: String!, expectedActorId: ID!): RideRequestCancellation!
      cancelRide(tripId: ID!, tripToken: String, reasonCode: String!, reason: String, idempotencyKey: String!, reassign: Boolean, expectedActorId: ID!, expectedAcceptedOfferId: ID!, expectedUpdatedAt: DateTime!, expectedFeeMinor: Int!, expectedCurrencyCode: String!): Cancellation!
      recordTripLocation(tripId: ID!, recordedAt: DateTime, coarseGeohash: String, encryptedCoordinateRef: String!, accuracyMeters: Int, providerEvidence: JSON): LocationEvent!
      submitTripReview(tripId: ID!, tripToken: String, rating: Int!, body: String, idempotencyKey: String!): Review!
      reportSafetyIncident(tripId: ID!, tripToken: String, severity: String, category: String, summary: String!, restrictedDetails: JSON, evidenceRefs: JSON, idempotencyKey: String!): SafetyIncident!
      openSupportCase(tripId: ID!, tripToken: String, category: String, subject: String!, description: String!, idempotencyKey: String!): SupportCase!
      sendTripMessage(tripId: ID!, tripToken: String, body: String!, idempotencyKey: String!): Message!
      initiateTripPayment(tripId: ID!, providerCode: String!, idempotencyKey: String!): Payment!
      requestTripRefund(paymentId: ID!, amountMinor: Int!, reason: String, idempotencyKey: String!): Refund!
      saveFleetBranding(fleetId: ID!, expectedUpdatedAt: DateTime!, logoIcon: String!, logoColor: String!, idempotencyKey: String!, expectedActorId: ID!): JSON!
      dismissRideshareOnboarding: Boolean!
      bootstrapRideshare(mode: String!): RideshareBootstrapResult!
      expireRideOffers(fleetId: ID!): OfferMaintenanceResult!
      expireRequestFleetOffers(requestId: ID!): OfferMaintenanceResult!
    }
  `, resolvers: {
    Query: {
      redirectToInit: redirectToInit_default,
      marketplaceRideshareServices,
      marketplaceRideshareService,
      marketplaceRideshareServiceAreas,
      publicRideshareTrip,
      publicRideshareRequest,
      myDriverWorkspace,
      myRideshareTrips,
      riderRequestStatus,
      myRideshareRequests,
      operatorTripHandoff,
      safetyQueueScope: (_root, _args, context) => hasAnyFleetScope(context, context.session, "safety"),
      financeQueueScope: (_root, _args, context) => hasAnyFleetScope(context, context.session, "finance"),
      rideshareCapabilities: async (_root, _args, context) => Object.fromEntries(await Promise.all(["operations", "drivers", "finance", "safety", "fleetAdmin"].map(async (capability) => [capability, await hasAnyFleetScope(context, context.session, capability)]))),
      tripCancellationPreview,
      riderRequestCancellationPreview,
      riderTripHistory,
      fleetBranding,
      dispatchCandidatePage,
      dispatchQueueScope: (_root, _args, context) => hasAnyFleetScope(context, context.session, "operations"),
      riderAccountOptions: () => ({ registrationEnabled: process.env.PUBLIC_SIGNUPS_ALLOWED === "true" })
    },
    Mutation: { saveFleetBranding, marketplaceRideshareQuote, requestRide, resolveRideRequestIntent, offerRideToDriver, respondToRideOffer, transitionTrip, cancelRideRequest, cancelRide, recordTripLocation, submitTripReview, reportSafetyIncident, openSupportCase, sendTripMessage, initiateTripPayment, requestTripRefund, bootstrapRideshare, dismissRideshareOnboarding, expireRideOffers, expireRequestFleetOffers }
  } });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
}
var transport = (0, import_nodemailer.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
function passwordResetEmail({ url }) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.SMTP_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/index.ts
var production = process.env.NODE_ENV === "production";
var databaseURL = process.env.DATABASE_URL || "postgresql://localhost/openfront_rideshare";
var sessionSecret = process.env.SESSION_SECRET || "development-only-session-secret-change-me-now";
if (production && (!process.env.DATABASE_URL || !process.env.SESSION_SECRET || sessionSecret.length < 32)) throw new Error("DATABASE_URL and SESSION_SECRET of at least 32 characters are required in production.");
var session = (0, import_session.statelessSessions)({ maxAge: 60 * 60 * 24 * 30, secret: sessionSecret });
var { withAuth } = (0, import_auth.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  // The first user's Admin role is assigned by the User resolveInput hook (see models/User.ts).
  initFirstItem: { fields: ["name", "email", "password"] },
  passwordResetLink: { async sendToken(args) {
    await sendPasswordResetEmail(args.token, args.identity);
  } },
  sessionData: `id name email role { id name ${permissionNames.join(" ")} }`
});
var storage = process.env.S3_BUCKET_NAME ? {
  my_images: {
    kind: "s3",
    type: "image",
    bucketName: process.env.S3_BUCKET_NAME,
    region: process.env.S3_REGION || "auto",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: s3ForcePathStyle(process.env.S3_ENDPOINT),
    signed: { expiry: 5e3 }
  }
} : void 0;
var keystone_default = withAuth((0, import_core13.config)({
  db: { provider: "postgresql", url: databaseURL },
  lists: models,
  session,
  graphql: { extendGraphqlSchema },
  storage,
  ui: { isAccessAllowed: (context) => permissions.canAccessDashboard({ context, session: context.session }) }
}));

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
