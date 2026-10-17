import {
  insert,
  nowIso,
  autoId,
  getMeta,
  setMeta,
  resetDatabase,
  query,
  setSettings,
  withTransaction,
} from "./db.js";
import { SCHEMA_VERSION } from "./schema.js";
import { upsertCredentials, verifyEmailsImmediately, markSeeded } from "./auth.js";
import { registerQrRecords } from "./qr-payload.js";
import {
  completeStage,
  failPreparation,
  finishPreparation,
  reportProgress,
  setStage,
} from "./progress.js";

export const DEMO_PASSWORD = "warq1234";
export const ADMIN_ID = "warq-admin";
export const ADMIN_PASSWORD = "admin1234";
export const SEED_NAME = "warq-demo-seed-1";

export const DEMO_ACCOUNTS = [
  {
    key: "admin",
    role: "admin",
    label: "Administrator",
    uid: "demo-admin",
    adminId: ADMIN_ID,
    email: "admin@warq.demo",
    password: ADMIN_PASSWORD,
    description: "Full admin console: users, orders, claims, pricing, support queue.",
    entry: "#/admin",
  },
  {
    key: "shopkeeper-1",
    role: "shopkeeper",
    label: "Shopkeeper · Rahman Electronics (Dhaka)",
    uid: "demo-shop-rahman",
    email: "rahman@warq.demo",
    password: DEMO_PASSWORD,
    description: "Active subscription, 22 QR codes, sales, claims and chat history.",
    entry: "#/app/dashboard",
  },
  {
    key: "shopkeeper-2",
    role: "shopkeeper",
    label: "Shopkeeper · Chattogram Mobile Zone",
    uid: "demo-shop-ctg",
    email: "ctg@warq.demo",
    password: DEMO_PASSWORD,
    description: "Unlimited access granted by the administrator, mixed warranty states.",
    entry: "#/app/dashboard",
  },
  {
    key: "shopkeeper-3",
    role: "shopkeeper",
    label: "Shopkeeper · Sylhet Home Appliance (no access)",
    uid: "demo-shop-sylhet",
    email: "sylhet@warq.demo",
    password: DEMO_PASSWORD,
    description: "Expired access with a pending free-access request, to demo the subscription flow.",
    entry: "#/app/subscription",
  },
  {
    key: "customer-1",
    role: "customer",
    label: "Customer · Nusrat Jahan",
    uid: "demo-cust-nusrat",
    email: "nusrat@warq.demo",
    password: DEMO_PASSWORD,
    description: "Customer portal: own warranties, QR scanning and warranty claims.",
    entry: "#/app/dashboard",
  },
  {
    key: "customer-2",
    role: "customer",
    label: "Customer · Tanvir Ahmed",
    uid: "demo-cust-tanvir",
    email: "tanvir@warq.demo",
    password: DEMO_PASSWORD,
    description: "Customer portal with an approved claim and an expired warranty.",
    entry: "#/app/dashboard",
  },
];

export const SHOP_ACCOUNTS = DEMO_ACCOUNTS.filter((account) => account.role === "shopkeeper");
export const CUSTOMER_ACCOUNTS = DEMO_ACCOUNTS.filter((account) => account.role === "customer");

export const PLANS = {
  monthly: { id: "monthly", name: "1 Month", amount: 50, months: 1 },
  halfYearly: { id: "halfYearly", name: "6 Months", amount: 200, months: 6 },
  yearly: { id: "yearly", name: "1 Year", amount: 350, months: 12 },
};

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(ms) {
  return new Date(ms).toISOString();
}

function daysAgo(days, jitterMinutes = 0) {
  return iso(Date.now() - days * DAY_MS - jitterMinutes * 60 * 1000);
}

function daysAhead(days, jitterMinutes = 0) {
  return iso(Date.now() + days * DAY_MS + jitterMinutes * 60 * 1000);
}

function minutesAgo(minutes) {
  return iso(Date.now() - minutes * 60 * 1000);
}

function addMonths(value, months) {
  const date = new Date(value);
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

function addDays(value, days) {
  return new Date(new Date(value).getTime() + days * DAY_MS).toISOString();
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260117);

function between(min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function money(value) {
  return Math.round(value * 100) / 100;
}

const CUSTOMERS = [
  ["Nusrat Jahan", "01811223344", "nusrat@warq.demo", "Flat 4B, Road 12, Dhanmondi, Dhaka", "Dhaka"],
  ["Tanvir Ahmed", "01912233445", "tanvir@warq.demo", "House 9, Road 2, Uttara Sector 4, Dhaka", "Dhaka"],
  ["Farhana Akter", "01712334455", "farhana.akter@example.com", "12/A Kazi Office Road, Mirpur, Dhaka", "Dhaka"],
  ["Mahmudul Hasan", "01612445566", "mahmudul.hasan@example.com", "Agrabad C/A, Chattogram", "Chattogram"],
  ["Sadia Islam", "01512556677", "sadia.islam@example.com", "Zindabazar, Sylhet", "Sylhet"],
  ["Rakib Hossain", "01312667788", "rakib.hossain@example.com", "Kandirpar, Comilla", "Cumilla"],
  ["Ayesha Siddika", "01912778899", "ayesha.siddika@example.com", "Shaheb Bazar, Rajshahi", "Rajshahi"],
  ["Imran Kabir", "01812889900", "imran.kabir@example.com", "Dhanmondi 27, Dhaka", "Dhaka"],
  ["Shamima Nasrin", "01712990011", "shamima.nasrin@example.com", "GEC Circle, Chattogram", "Chattogram"],
  ["Jahid Hasan", "01612001122", "jahid.hasan@example.com", "Ambarkhana, Sylhet", "Sylhet"],
  ["Rehana Parvin", "01512112233", "rehana.parvin@example.com", "Bashundhara City, Panthapath, Dhaka", "Dhaka"],
  ["Sohel Rana", "01312223344", "sohel.rana@example.com", "Chawkbazar, Chattogram", "Chattogram"],
  ["Mehedi Hasan", "01912334455", "mehedi.hasan@example.com", "New Market, Khulna", "Khulna"],
  ["Tahmina Begum", "01812445566", "tahmina.begum@example.com", "Uttara Sector 7, Dhaka", "Dhaka"],
  ["Arif Chowdhury", "01712556677", "arif.chowdhury@example.com", "Bogura Sadar, Bogura", "Bogura"],
].map(([name, phone, email, address, district]) => ({ name, phone, email, address, district }));

const SHOPS = [
  {
    uid: "demo-shop-rahman",
    code: "DHK",
    email: "rahman@warq.demo",
    name: "Abdur Rahman",
    shopName: "Rahman Electronics",
    mobile: "01711223344",
    shopAddress: "Shop 24, Mirpur 10 Market, Dhaka 1216",
    deliveryAddress: "House 12, Road 4, Mirpur 10, Dhaka 1216",
    district: "Dhaka",
    upazila: "Mirpur",
    unlimited: false,
    plan: "halfYearly",
    accessEndsInDays: 46,
    purchasedDaysAgo: 20,
    soldCount: 18,
    unusedCount: 4,
    products: [
      { id: "P1", productName: "Samsung Galaxy A15", productModel: "SM-A155F 6/128GB", brandName: "Samsung", defaultPrice: 22500, costPrice: 20600, months: 12 },
      { id: "P2", productName: "Walton Refrigerator", productModel: "WFC-2A0 210L", brandName: "Walton", defaultPrice: 46500, costPrice: 42900, months: 24 },
      { id: "P3", productName: "Vision LED TV", productModel: "V32D 32 inch", brandName: "Vision", defaultPrice: 21900, costPrice: 19500, months: 12 },
      { id: "P4", productName: "Xiaomi Redmi Note 13", productModel: "23124RA7EO", brandName: "Xiaomi", defaultPrice: 24999, costPrice: 23200, months: 12 },
      { id: "P5", productName: "Asus Vivobook 15", productModel: "X1504ZA", brandName: "Asus", defaultPrice: 64500, costPrice: 61200, months: 24 },
      { id: "P6", productName: "Minister Ceiling Fan", productModel: "Celebrity 56 inch", brandName: "Minister", defaultPrice: 3400, costPrice: 2920, months: 6, noWarranty: false },
    ],
  },
  {
    uid: "demo-shop-ctg",
    code: "CTG",
    email: "ctg@warq.demo",
    name: "Kamrul Islam",
    shopName: "Chattogram Mobile Zone",
    mobile: "01822334455",
    shopAddress: "Shop 7, GEC Circle, Chattogram 4000",
    deliveryAddress: "Shop 7, GEC Circle, Chattogram 4000",
    district: "Chattogram",
    upazila: "Panchlaish",
    unlimited: true,
    plan: null,
    accessEndsInDays: null,
    purchasedDaysAgo: null,
    soldCount: 14,
    unusedCount: 4,
    products: [
      { id: "P1", productName: "realme C67", productModel: "RMX3890 8/128GB", brandName: "realme", defaultPrice: 19999, costPrice: 18400, months: 12 },
      { id: "P2", productName: "Oppo A18", productModel: "CPH2591 4/64GB", brandName: "Oppo", defaultPrice: 15990, costPrice: 14750, months: 12 },
      { id: "P3", productName: "Symphony Z60", productModel: "Z60 6/128GB", brandName: "Symphony", defaultPrice: 11490, costPrice: 10500, months: 6 },
      { id: "P4", productName: "Lava Blaze 2", productModel: "Blaze 2 6/128GB", brandName: "Lava", defaultPrice: 13990, costPrice: 12850, months: 12 },
      { id: "P5", productName: "Haylou Smart Watch", productModel: "LS05 Solar Plus", brandName: "Haylou", defaultPrice: 3200, costPrice: 2580, months: 0 },
    ],
  },
  {
    uid: "demo-shop-sylhet",
    code: "SYL",
    email: "sylhet@warq.demo",
    name: "Nazrul Mia",
    shopName: "Sylhet Home Appliance",
    mobile: "01933445566",
    shopAddress: "Zindabazar Point, Sylhet 3100",
    deliveryAddress: "Zindabazar Point, Sylhet 3100",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
    unlimited: false,
    plan: "monthly",
    accessEndsInDays: -4,
    purchasedDaysAgo: 34,
    soldCount: 8,
    unusedCount: 4,
    products: [
      { id: "P1", productName: "Singer Refrigerator", productModel: "SFR-280L", brandName: "Singer", defaultPrice: 52000, costPrice: 48100, months: 24 },
      { id: "P2", productName: "Butterfly Rice Cooker", productModel: "CFXB40 1.8L", brandName: "Butterfly", defaultPrice: 4200, costPrice: 3720, months: 12 },
      { id: "P3", productName: "Electra Air Cooler", productModel: "EC-70XL", brandName: "Electra", defaultPrice: 12500, costPrice: 11200, months: 6 },
      { id: "P4", productName: "Marcel Water Purifier", productModel: "MWP-8L RO", brandName: "Marcel", defaultPrice: 18500, costPrice: 16900, months: 12 },
    ],
  },
];

const SOLD_PLAN = [
  "active", "active", "active", "expiring", "active", "expired", "active", "claimed", "active", "returned",
  "active", "expired", "active", "active", "expiring", "claimed", "active", "active", "expired", "active",
  "claimed", "active", "expired", "active", "expiring", "active", "expired", "claimed", "active", "returned",
  "active", "expired", "active", "active", "expiring", "expired", "active", "active", "expired", "active",
];

const CLAIM_STATUS_PLAN = ["submitted", "reviewing", "approved", "rejected", "resolved", "submitted"];

const CLAIM_CATEGORIES = ["repair", "replacement", "refund", "other"];

const CLAIM_DESCRIPTIONS = [
  "The display stopped responding after two weeks of normal use. Requesting a warranty repair.",
  "Cooling performance dropped significantly and the unit makes a loud noise at night.",
  "The device restarts on its own several times a day. Please check under warranty.",
  "Remote control and one HDMI port are not working even after replacing the cable.",
  "Battery drains from full charge to empty within three hours of light use.",
  "The fan motor is humming and the regulator does not change speed anymore.",
];

function folderNameFor(product) {
  return product.productModel ? `${product.productName} ${product.productModel}` : product.productName;
}

function folderKey(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function claimCode(index) {
  return `CLM-${String(index + 1).padStart(4, "0")}-${autoId().slice(0, 4).toUpperCase()}`;
}

function timelineEntry(status, at, note) {
  return { status, at, note: note || "" };
}

async function seedUsers() {
  const credentials = upsertCredentials(
    DEMO_ACCOUNTS.map((account) => ({
      uid: account.uid,
      email: account.email,
      password: account.password,
      emailVerified: true,
      role: account.role,
      adminId: account.role === "admin" ? account.adminId : null,
    })),
  );
  const recordCount = SHOPS.length + CUSTOMER_ACCOUNTS.length + 1;
  let recordIndex = 0;
  const markRecord = () => {
    recordIndex += 1;
    reportProgress("accounts", recordIndex / recordCount);
  };

  for (const shop of SHOPS) {
    const createdAt = daysAgo(150 + between(0, 90));
    await insert("users", {
      id: shop.uid,
      email: shop.email,
      name: shop.name,
      shopName: shop.shopName,
      bio: `${shop.shopName} — authorised retailer of consumer electronics and home appliances.`,
      mobile: shop.mobile,
      shopAddress: shop.shopAddress,
      deliveryAddress: shop.deliveryAddress,
      sameAsShopAddress: false,
      district: shop.district,
      upazila: shop.upazila,
      role: "merchant",
      subscriptionStatus: shop.unlimited ? "admin_granted" : shop.accessEndsInDays > 0 ? "active" : "inactive",
      subscriptionPlan: shop.plan,
      subscriptionPlanName: shop.plan ? PLANS[shop.plan]?.name : shop.unlimited ? "Administrator free access" : null,
      subscriptionPurchasedAt: shop.purchasedDaysAgo === null ? null : daysAgo(shop.purchasedDaysAgo),
      subscriptionEndsAt:
        shop.accessEndsInDays === null
          ? null
          : shop.accessEndsInDays > 0
            ? daysAhead(shop.accessEndsInDays)
            : daysAgo(Math.abs(shop.accessEndsInDays)),
      accessStartAt: shop.purchasedDaysAgo === null ? daysAgo(40) : daysAgo(shop.purchasedDaysAgo),
      unlimitedAccess: shop.unlimited,
      disabled: false,
      banned: false,
      createdAt,
      updatedAt: nowIso(),
    });
    markRecord();
  }

  for (const account of CUSTOMER_ACCOUNTS) {
    const customer = CUSTOMERS.find((entry) => entry.email === account.email) || CUSTOMERS[0];
    await insert("users", {
      id: account.uid,
      email: account.email,
      name: customer.name,
      shopName: "",
      mobile: customer.phone,
      shopAddress: customer.address,
      deliveryAddress: customer.address,
      sameAsShopAddress: true,
      district: customer.district,
      upazila: customer.district === "Dhaka" ? "Dhanmondi" : customer.district,
      role: "customer",
      subscriptionStatus: "customer",
      unlimitedAccess: false,
      disabled: false,
      banned: false,
      createdAt: daysAgo(200),
      updatedAt: nowIso(),
    });
    markRecord();
  }

  await insert("users", {
    id: "demo-admin",
    email: "admin@warq.demo",
    name: "WarQ Administrator",
    shopName: "WarQ Control Center",
    mobile: "01815533416",
    shopAddress: "WarQ HQ, Dhaka",
    deliveryAddress: "WarQ HQ, Dhaka",
    district: "Dhaka",
    upazila: "Gulshan",
    role: "admin_console",
    subscriptionStatus: "admin_console",
    unlimitedAccess: true,
    disabled: false,
    banned: false,
    createdAt: daysAgo(300),
    updatedAt: nowIso(),
  });
  markRecord();
  await credentials;
}

async function seedInventory(onProgress) {
  const products = [];
  const soldRecords = [];
  let soldCursor = 0;
  let customerCursor = 0;
  const totalUnits = SHOPS.reduce((sum, shop) => {
    const soldForShop = Math.round(shop.soldCount / shop.products.length);
    const unusedForShop = Math.max(1, Math.round(shop.unusedCount / shop.products.length));
    return sum + shop.products.length * (soldForShop + unusedForShop);
  }, 0);
  let completedUnits = 0;
  const tickUnit = () => {
    completedUnits += 1;
    if (typeof onProgress === "function") {
      onProgress(completedUnits / Math.max(1, totalUnits));
    }
  };

  for (const shop of SHOPS) {
    let shopSoldCursor = 0;
    const shopSoldTarget = Math.min(shop.soldCount, SOLD_PLAN.length - soldCursor);
    for (const product of shop.products) {
      const requestId = `req-${shop.code}-${product.id}`;
      const groupId = `grp-${shop.code}-${product.id}`;
      const folder = folderNameFor(product);
      const warrantyDuration =
        product.months > 0
          ? { months: product.months, days: 0, hours: 0, minutes: 0, seconds: 0 }
          : null;
      const requestedAt = daysAgo(120 - (product.id.charCodeAt(1) % 20));

      await insert("sticker_requests", {
        id: requestId,
        ownerId: shop.uid,
        shopName: shop.shopName,
        shopAddress: shop.shopAddress,
        folderName: folder,
        folderNameKey: folderKey(folder),
        targetGroupId: null,
        products: [
          {
            id: product.id,
            productName: product.productName,
            productModel: product.productModel,
            brandName: product.brandName,
            quantity: 0,
            defaultPrice: product.defaultPrice,
            costPrice: product.costPrice,
            warrantyDuration: warrantyDuration || {},
            notes: "",
          },
        ],
        productCount: 1,
        totalQrCodes: 0,
        totalStickerQuantity: 0,
        fulfillment: "digital",
        stickerPackSize: 300,
        stickerPackPrice: 50,
        perStickerPrice: 0.166667,
        stickerSubtotal: 0,
        deliveryCharge: 0,
        totalPrice: 0,
        status: "generated",
        generationKey: autoId(),
        folderSerialStart: 0,
        generatedAt: requestedAt,
        generatedBy: shop.uid,
        paymentStatus: "not_required",
        deliveryStatus: "digital_ready",
        createdAt: requestedAt,
        updatedAt: requestedAt,
      });

      await insert("qr_groups", {
        id: groupId,
        ownerId: shop.uid,
        requestId,
        folderName: folder,
        folderNameKey: folderKey(folder),
        productName: product.productName,
        productModel: product.productModel,
        brandName: product.brandName,
        productNames: [product.productName],
        productCount: 1,
        totalQrs: 0,
        nextSerial: 0,
        shopName: shop.shopName,
        shopAddress: shop.shopAddress,
        deletionState: "normal",
        lastAddedAt: requestedAt,
        createdAt: requestedAt,
        updatedAt: requestedAt,
      });

      await insert("qr_folder_names", {
        id: `fld-${shop.code}-${product.id}`,
        ownerId: shop.uid,
        folderName: folder,
        folderNameKey: folderKey(folder),
        groupId,
        createdAt: requestedAt,
        updatedAt: requestedAt,
      });

      const soldForShop = Math.round(shop.soldCount / shop.products.length);
      const unusedForShop = Math.max(1, Math.round(shop.unusedCount / shop.products.length));
      const batchSize = soldForShop + unusedForShop;
      let serial = 0;

      for (let index = 0; index < batchSize; index += 1) {
        serial += 1;
        const isSold = shopSoldCursor < shopSoldTarget && index < soldForShop;
        const plan = isSold ? SOLD_PLAN[soldCursor] : "unused";
        const code = `WQ-${shop.code}-${product.id}-${String(serial).padStart(4, "0")}`;
        const createdAt = requestedAt;
        const qr = {
          id: `qr-${code}`,
          code,
          ownerId: shop.uid,
          requestId,
          groupId,
          folderName: folder,
          serial,
          productId: product.id,
          productName: product.productName,
          productModel: product.productModel,
          brandName: product.brandName,
          defaultPrice: product.defaultPrice,
          costPrice: product.costPrice,
          actualPrice: null,
          warrantyDuration,
          shopName: shop.shopName,
          shopAddress: shop.shopAddress,
          notes: "",
          status: "generated",
          saleId: null,
          customerName: null,
          customerPhone: null,
          customerEmail: null,
          customerAddress: null,
          customerNotes: null,
          saleDate: null,
          soldAt: null,
          activatedAt: null,
          activationDate: null,
          activatedBy: null,
          warrantyExpiresAt: null,
          warrantyVoidedAt: null,
          returnedAt: null,
          returnedBy: null,
          returnReason: "",
          createdAt,
          updatedAt: createdAt,
        };

        if (isSold) {
          const customer = CUSTOMERS[customerCursor % CUSTOMERS.length];
          customerCursor += 1;
          const actualPrice = money(product.defaultPrice - between(0, Math.round(product.defaultPrice * 0.06)));
          let soldAt = daysAgo(between(6, 80));
          let expiresAt = warrantyDuration ? addMonths(soldAt, product.months) : null;

          if (plan === "expiring" && warrantyDuration) {
            expiresAt = daysAhead(between(1, 6), between(0, 700));
            soldAt = addMonths(expiresAt, -product.months);
          }
          if (plan === "expired" && warrantyDuration) {
            soldAt = daysAgo(product.months * 30 + between(10, 150));
            expiresAt = addMonths(soldAt, product.months);
          }
          if (plan === "returned") {
            soldAt = daysAgo(between(20, 70));
            expiresAt = warrantyDuration ? addMonths(soldAt, product.months) : null;
          }

          const saleId = `sale-${code}`;
          const returnedAt = plan === "returned" ? addDays(soldAt, between(3, 12)) : null;
          const status = plan === "returned" ? "returned" : "activated";

          Object.assign(qr, {
            status,
            saleId,
            actualPrice,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerEmail: customer.email,
            customerAddress: customer.address,
            customerNotes: "",
            saleDate: soldAt,
            soldAt,
            activatedAt: soldAt,
            activationDate: soldAt,
            activatedBy: shop.uid,
            warrantyExpiresAt: expiresAt,
            warrantyVoidedAt: returnedAt,
            returnedAt,
            returnedBy: returnedAt ? shop.uid : null,
            returnReason: returnedAt ? "Customer returned the product within the exchange window." : "",
            updatedAt: returnedAt || soldAt,
          });

          await insert("sales", {
            id: saleId,
            ownerId: shop.uid,
            qrId: qr.id,
            code,
            requestId,
            productId: product.id,
            productName: product.productName,
            productModel: product.productModel,
            brandName: product.brandName,
            serial,
            defaultPrice: product.defaultPrice,
            costPrice: product.costPrice,
            actualPrice,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerEmail: customer.email,
            customerAddress: customer.address,
            customerNotes: "",
            saleDate: soldAt,
            soldAt,
            activatedAt: soldAt,
            activationDate: soldAt,
            activatedBy: shop.uid,
            warrantyDuration,
            warrantyExpiresAt: expiresAt,
            warrantyVoidedAt: returnedAt,
            status,
            returnedAt,
            returnedBy: returnedAt ? shop.uid : null,
            returnReason: returnedAt ? qr.returnReason : "",
            shopName: shop.shopName,
            shopAddress: shop.shopAddress,
            editedBy: null,
            createdAt: soldAt,
            updatedAt: returnedAt || soldAt,
          });

          soldRecords.push({ shop, product, qr, plan, customer, saleId, soldAt, expiresAt });
          soldCursor += 1;
          shopSoldCursor += 1;
        }

        const stored = await insert("qrs", qr);
        products.push(stored);
        tickUnit();
      }
    }
  }

  for (const shop of SHOPS) {
    const shopProducts = products.filter((qr) => qr.ownerId === shop.uid);
    const groupIds = [...new Set(shopProducts.map((qr) => qr.groupId))];
    for (const groupId of groupIds) {
      const groupQrs = shopProducts.filter((qr) => qr.groupId === groupId);
      const requestId = groupQrs[0]?.requestId;
      await query("UPDATE qr_groups SET total_qrs = $1, next_serial = $2 WHERE id = $3", [
        groupQrs.length,
        groupQrs.length,
        groupId,
      ]);
      await query("UPDATE sticker_requests SET total_qr_codes = $1 WHERE id = $2", [
        groupQrs.length,
        requestId,
      ]);
    }
  }

  if (typeof onProgress === "function") onProgress(1);
  return { products, soldRecords };
}

async function seedClaims(soldRecords) {
  const claimed = soldRecords.filter((entry) => entry.plan === "claimed");
  const extra = soldRecords.filter((entry) => entry.plan === "active").slice(0, 6 - claimed.length);
  const targets = [...claimed, ...extra].slice(0, 6);
  const claims = [];
  let index = 0;
  for (const entry of targets) {
    const status = CLAIM_STATUS_PLAN[index % CLAIM_STATUS_PLAN.length];
    const category = CLAIM_CATEGORIES[index % CLAIM_CATEGORIES.length];
    const description = CLAIM_DESCRIPTIONS[index % CLAIM_DESCRIPTIONS.length];
    const createdAt = daysAgo(between(2, 25), between(0, 900));
    const isCustomerAccount = CUSTOMER_ACCOUNTS.some((account) => account.email === entry.customer.email);
    const customerUserId = isCustomerAccount
      ? CUSTOMER_ACCOUNTS.find((account) => account.email === entry.customer.email).uid
      : null;
    const timeline = [timelineEntry("submitted", createdAt, "Claim submitted by the customer.")];
    let reviewedAt = null;
    let resolutionNote = "";
    if (status !== "submitted") {
      const reviewingAt = addDays(createdAt, 1);
      timeline.push(timelineEntry("reviewing", reviewingAt, "Shopkeeper is inspecting the product."));
      if (status === "approved" || status === "resolved") {
        reviewedAt = addDays(createdAt, 3);
        resolutionNote = "Approved: repair scheduled at the service counter under warranty.";
        timeline.push(timelineEntry("approved", reviewedAt, resolutionNote));
      }
      if (status === "rejected") {
        reviewedAt = addDays(createdAt, 2);
        resolutionNote = "Rejected: physical damage found, not covered by the warranty policy.";
        timeline.push(timelineEntry("rejected", reviewedAt, resolutionNote));
      }
      if (status === "resolved") {
        timeline.push(timelineEntry("resolved", addDays(createdAt, 6), "Product repaired and returned to the customer."));
      }
    }
    const claim = await insert("claims", {
      id: `claim-${index + 1}-${autoId().slice(0, 6)}`,
      code: claimCode(index),
      ownerId: entry.shop.uid,
      qrId: entry.qr.id,
      qrCode: entry.qr.code,
      customerUserId,
      customerName: entry.customer.name,
      customerPhone: entry.customer.phone,
      customerEmail: entry.customer.email,
      category,
      description,
      status,
      resolutionNote,
      createdAt,
      updatedAt: reviewedAt || createdAt,
      reviewedBy: reviewedAt ? entry.shop.uid : null,
      reviewedAt,
      timeline,
    });
    claims.push(claim);
    index += 1;
  }
  return claims;
}

async function seedChat() {
  const aiTurns = [
    ["user", "How long does the warranty last on a Walton refrigerator I sell under WarQ?", 240],
    [
      "assistant",
      "The warranty length is defined by the **product model** when you create the QR request, not by the sticker itself.\n\nWhen you create the folder for the Walton refrigerator you can pick any duration, for example `24 Months`. Every QR you generate in that folder inherits it, and the countdown only starts the moment you record the sale.\n\n- Folder duration = maximum coverage\n- Sale date = countdown start\n- Returned product = warranty voided",
      239,
    ],
    ["user", "Can a customer see the warranty without installing anything?", 120],
    [
      "assistant",
      "Yes. Scanning the sticker opens a public WarQ page that needs no account.\n\nThe page shows the product, the shop, the purchase date, the warranty duration and a **live countdown** to expiry. Personal details and your cost prices are never exposed on that public view.",
      119,
    ],
    ["user", "What happens if I mark a sale as returned?", 45],
    [
      "assistant",
      "The sale and its warranty history stay permanently in your records, but the warranty is voided.\n\nThe public page switches to **Warranty Voided** and the report keeps counting it as a return.",
      44,
    ],
  ];

  for (const [role, content, minutes] of aiTurns) {
    await insert("ai_chat_messages", {
      id: `ai-${autoId()}`,
      ownerId: "demo-shop-rahman",
      role,
      content,
      deleted: false,
      createdAt: minutesAgo(minutes),
    });
  }

  const threads = [
    {
      id: "thread-rahman-1",
      ownerId: "demo-shop-rahman",
      status: "active",
      subject: "QR sticker order delay",
      unreadByAdmin: 0,
      unreadByUser: 1,
      queuePosition: null,
      messages: [
        ["system", "Your support request has been received. Please describe your problem in detail and upload any relevant screenshots or images. The administrator will review your request and respond as soon as they are available.", 95],
        ["user", "I ordered 300 printed stickers for Mirpur on Sunday but the courier has not called me yet. Order id in my Orders tab.", 92],
        ["admin", "Thanks for flagging it. I checked the order — it is marked preparing. The courier picks up from our Dhaka desk every evening, so it should be out for delivery tomorrow.", 80],
        ["user", "Got it, please keep the Mirpur address as it is.", 78],
      ],
    },
    {
      id: "thread-ctg-1",
      ownerId: "demo-shop-ctg",
      status: "resolved",
      subject: "Report export question",
      unreadByAdmin: 0,
      unreadByUser: 0,
      queuePosition: null,
      messages: [
        ["system", "Your support request has been received. Please describe your problem in detail and upload any relevant screenshots or images. The administrator will review your request and respond as soon as they are available.", 1500],
        ["user", "The monthly CSV export shows zero revenue for last month even though I sold phones.", 1480],
        ["admin", "That happens when the sale is recorded with the activation date inside the previous month. Open the report, switch the period to All time, and the rows appear. I have also reset the period cache for your shop.", 1450],
        ["user", "Confirmed working now, thanks.", 1440],
      ],
    },
    {
      id: "thread-sylhet-1",
      ownerId: "demo-shop-sylhet",
      status: "waiting",
      subject: "Access expired",
      unreadByAdmin: 1,
      unreadByUser: 0,
      queuePosition: 1,
      messages: [
        ["system", "Your support request has been received. Please describe your problem in detail and upload any relevant screenshots or images. The administrator will review your request and respond as soon as they are available.", 30],
        ["user", "My WarQ access expired yesterday and I still have customers scanning stickers. I sent a free-access request as well.", 28],
      ],
    },
  ];

  const adminUser = {
    id: "demo-admin",
    name: "WarQ Administrator",
    email: "admin@warq.demo",
    shopName: "WarQ Control Center",
    mobile: "01815533416",
  };

  for (const thread of threads) {
    const shop = SHOPS.find((entry) => entry.uid === thread.ownerId);
    const user = await query("SELECT * FROM users WHERE id = $1", [thread.ownerId]);
    const first = thread.messages[0];
    const last = thread.messages[thread.messages.length - 1];
    const createdAt = minutesAgo(first[2]);
    const lastAt = minutesAgo(last[2]);
    await insert("support_threads", {
      id: thread.id,
      ownerId: thread.ownerId,
      status: thread.status,
      subject: thread.subject,
      lastMessageAt: lastAt,
      lastMessagePreview: String(last[1]).slice(0, 180),
      unreadByAdmin: thread.unreadByAdmin,
      unreadByUser: thread.unreadByUser,
      adminJoinedAt: thread.messages.some(([role]) => role === "admin") ? minutesAgo(last[2] + 5) : null,
      resolvedAt: thread.status === "resolved" ? minutesAgo(1400) : null,
      resolvedBy: thread.status === "resolved" ? "demo-admin" : null,
      assignedAdminId: thread.messages.some(([role]) => role === "admin") ? "demo-admin" : null,
      userName: shop?.name || user.rows[0]?.name || "",
      userEmail: shop?.email || "",
      userShopName: shop?.shopName || "",
      userMobile: shop?.mobile || "",
      createdAt,
      updatedAt: lastAt,
    });
    for (const [role, text, minutes] of thread.messages) {
      await insert("support_messages", {
        id: `msg-${autoId()}`,
        threadId: thread.id,
        senderId: role === "admin" ? adminUser.id : role === "system" ? "system" : thread.ownerId,
        senderRole: role,
        text,
        imageId: null,
        replyTo: null,
        deleted: false,
        edited: false,
        createdAt: minutesAgo(minutes),
      });
    }
  }
}

async function seedBilling() {
  await insert("payments", {
    id: "pay-rahman-1",
    ownerId: "demo-shop-rahman",
    provider: "bkash",
    packageId: "monthly",
    packageName: PLANS.monthly.name,
    kind: "subscription",
    currency: "BDT",
    amount: PLANS.monthly.amount,
    status: "paid",
    gatewayPaymentId: `BK${autoId().slice(0, 10).toUpperCase()}`,
    gatewayTransactionId: `TRX${autoId().slice(0, 8).toUpperCase()}`,
    verifiedAt: daysAgo(52),
    createdAt: daysAgo(52),
    updatedAt: daysAgo(52),
  });

  await insert("payments", {
    id: "pay-rahman-2",
    ownerId: "demo-shop-rahman",
    provider: "nagad",
    packageId: "halfYearly",
    packageName: PLANS.halfYearly.name,
    kind: "subscription",
    currency: "BDT",
    amount: PLANS.halfYearly.amount,
    status: "paid",
    gatewayPaymentId: `NG${autoId().slice(0, 10).toUpperCase()}`,
    gatewayTransactionId: `TRX${autoId().slice(0, 8).toUpperCase()}`,
    verifiedAt: daysAgo(20),
    createdAt: daysAgo(20),
    updatedAt: daysAgo(20),
  });

  await insert("payments", {
    id: "pay-ctg-1",
    ownerId: "demo-shop-ctg",
    provider: "bkash",
    packageId: "yearly",
    packageName: PLANS.yearly.name,
    kind: "subscription",
    currency: "BDT",
    amount: PLANS.yearly.amount,
    status: "paid",
    gatewayPaymentId: `BK${autoId().slice(0, 10).toUpperCase()}`,
    gatewayTransactionId: `TRX${autoId().slice(0, 8).toUpperCase()}`,
    verifiedAt: daysAgo(88),
    createdAt: daysAgo(88),
    updatedAt: daysAgo(88),
  });

  await insert("payments", {
    id: "pay-sylhet-1",
    ownerId: "demo-shop-sylhet",
    provider: "nagad",
    packageId: "monthly",
    packageName: PLANS.monthly.name,
    kind: "subscription",
    currency: "BDT",
    amount: PLANS.monthly.amount,
    status: "paid",
    gatewayPaymentId: `NG${autoId().slice(0, 10).toUpperCase()}`,
    gatewayTransactionId: `TRX${autoId().slice(0, 8).toUpperCase()}`,
    verifiedAt: daysAgo(34),
    createdAt: daysAgo(34),
    updatedAt: daysAgo(34),
  });

  const physicalRequests = [
    {
      id: "req-rahman-print-1",
      ownerId: "demo-shop-rahman",
      folderName: "Printed sticker pack — Mirpur counter",
      productIndex: 0,
      quantity: 300,
      paymentProvider: "bkash",
      paymentId: "pay-rahman-print-1",
      deliveryStatus: "delivered",
      createdDaysAgo: 26,
      paidDaysAgo: 25,
    },
    {
      id: "req-rahman-print-2",
      ownerId: "demo-shop-rahman",
      folderName: "Printed sticker pack — Uttara branch",
      productIndex: 3,
      quantity: 300,
      paymentProvider: "nagad",
      paymentId: "pay-rahman-print-2",
      deliveryStatus: "preparing",
      createdDaysAgo: 5,
      paidDaysAgo: 4,
    },
  ];

  for (const entry of physicalRequests) {
    const shop = SHOPS.find((item) => item.uid === entry.ownerId);
    const product = shop.products[entry.productIndex];
    const stickerSubtotal = money((entry.quantity / 300) * 50);
    const deliveryCharge = 120;
    await insert("sticker_requests", {
      id: entry.id,
      ownerId: entry.ownerId,
      shopName: shop.shopName,
      shopAddress: shop.shopAddress,
      folderName: entry.folderName,
      folderNameKey: folderKey(entry.folderName),
      targetGroupId: null,
      products: [
        {
          id: product.id,
          productName: product.productName,
          productModel: product.productModel,
          brandName: product.brandName,
          quantity: entry.quantity,
          defaultPrice: product.defaultPrice,
          costPrice: product.costPrice,
          warrantyDuration: product.months
            ? { months: product.months, days: 0, hours: 0, minutes: 0, seconds: 0 }
            : {},
          notes: "",
        },
      ],
      productCount: 1,
      totalQrCodes: 0,
      totalStickerQuantity: entry.quantity,
      fulfillment: "physical",
      stickerPackSize: 300,
      stickerPackPrice: 50,
      perStickerPrice: 0.166667,
      stickerSubtotal,
      deliveryCharge,
      totalPrice: money(stickerSubtotal + deliveryCharge),
      status: "generated",
      generationKey: autoId(),
      folderSerialStart: 0,
      generatedAt: daysAgo(entry.createdDaysAgo),
      generatedBy: entry.ownerId,
      paymentStatus: "paid",
      paymentId: entry.paymentId,
      paidAt: daysAgo(entry.paidDaysAgo),
      deliveryStatus: entry.deliveryStatus,
      upgradedToPhysicalAt: daysAgo(entry.createdDaysAgo - 1),
      createdAt: daysAgo(entry.createdDaysAgo),
      updatedAt: daysAgo(entry.paidDaysAgo),
    });

    await insert("payments", {
      id: entry.paymentId,
      ownerId: entry.ownerId,
      provider: entry.paymentProvider,
      packageId: null,
      packageName: "Printed sticker delivery",
      stickerRequestId: entry.id,
      kind: "sticker_request",
      currency: "BDT",
      amount: money(stickerSubtotal + deliveryCharge),
      status: "paid",
      gatewayPaymentId: `${entry.paymentProvider === "bkash" ? "BK" : "NG"}${autoId().slice(0, 10).toUpperCase()}`,
      gatewayTransactionId: `TRX${autoId().slice(0, 8).toUpperCase()}`,
      verifiedAt: daysAgo(entry.paidDaysAgo),
      createdAt: daysAgo(entry.paidDaysAgo),
      updatedAt: daysAgo(entry.paidDaysAgo),
    });
  }

  await insert("access_requests", {
    id: "access-sylhet-1",
    ownerId: "demo-shop-sylhet",
    status: "pending",
    message: "My subscription expired and customers are still scanning stickers. Please grant temporary access so I can keep activating sales.",
    resolvedAt: null,
    resolvedBy: null,
    adminNote: null,
    createdAt: daysAgo(2, 180),
    updatedAt: daysAgo(2, 180),
  });
}

async function seedNotifications() {
  const notifications = [
    {
      recipientId: "demo-shop-rahman",
      title: "Warranty expiring soon",
      message: "3 warranties in the Manchester folder expire within the next 7 days. Review the Sales page to contact those customers.",
      readAt: null,
      createdDaysAgo: 1,
    },
    {
      recipientId: "demo-shop-rahman",
      title: "Sticker delivery dispatched",
      message: "Your printed sticker pack for the Uttara branch is being prepared for courier pickup.",
      readAt: null,
      createdDaysAgo: 3,
    },
    {
      recipientId: "demo-shop-rahman",
      title: "Claim submitted",
      message: "A customer submitted a warranty claim against WQ-DHK-P2-0005. Review it in the Claims panel.",
      readAt: daysAgo(5),
      createdDaysAgo: 6,
    },
    {
      recipientId: "demo-shop-ctg",
      title: "Welcome to WarQ",
      message: "Your shop is live. Scan any sticker or open a QR folder to get started.",
      readAt: null,
      createdDaysAgo: 88,
    },
  ];

  for (const entry of notifications) {
    await insert("notifications", {
      id: `notif-${autoId()}`,
      recipientId: entry.recipientId,
      title: entry.title,
      message: entry.message,
      type: "info",
      audience: "single",
      createdBy: "demo-admin",
      readAt: entry.readAt,
      createdAt: daysAgo(entry.createdDaysAgo),
    });
  }
}

async function seedAudit() {
  const entries = [
    ["demo-admin", "pricing.update", "settings", { stickerPackSize: 300, stickerPackPrice: 50, deliveryCharge: 120 }],
    ["demo-admin", "access.grant", "demo-shop-ctg", { unlimited: true }],
    ["demo-shop-rahman", "sale.record", "WQ-DHK-P1-0001", { actualPrice: 21800 }],
    ["demo-shop-rahman", "sale.return", "WQ-DHK-P4-0009", { reason: "Customer returned the product" }],
    ["demo-shop-sylhet", "access.request", "demo-shop-sylhet", { message: "Temporary access request" }],
  ];
  let index = 0;
  for (const [actorId, action, targetId, details] of entries) {
    index += 1;
    await insert("audit_logs", {
      id: `audit-${autoId()}`,
      actorId,
      action,
      targetId,
      details,
      createdAt: daysAgo(index * 3),
    });
  }
}

export async function seedAll() {
  return withTransaction(async () => {
    await setSettings({
      stickerPackSize: 300,
      stickerPackPrice: 50,
      perStickerPrice: 0.166667,
      deliveryCharge: 120,
      updatedBy: "demo-admin",
    });

    setStage("accounts", "Hashing the demo passwords, then writing the shop, customer and administrator records.");
    await seedUsers();
    completeStage("accounts", "Sample accounts are ready with hashed passwords.");

    setStage("catalogue", "Creating sticker folders, products, QR codes and recorded sales.");
    const { products, soldRecords } = await seedInventory((ratio) => reportProgress("catalogue", ratio * 0.92));
    completeStage("catalogue", `${products.length} warranty codes and ${soldRecords.length} recorded sales are ready.`);

    setStage("claims", "Attaching submitted, reviewing, approved and resolved claims.");
    await seedClaims(soldRecords);
    completeStage("claims");

    setStage("chat", "Loading the assistant conversation and the support threads.");
    await seedChat();
    completeStage("chat");

    setStage("billing", "Restoring subscription payments, printed-sticker orders and the access request.");
    await seedBilling();
    completeStage("billing");

    setStage("inbox", "Filling the notification inbox.");
    await seedNotifications();
    completeStage("inbox");

    setStage("audit", "Writing the administrator activity log.");
    await seedAudit();
    completeStage("audit");

    setStage("qr", "Compressing and checksum-signing every printable QR payload.");
    await registerQrRecords(products, (ratio) => reportProgress("qr", ratio));
    completeStage("qr", `${products.length} QR payloads carry an offline-readable copy of the warranty.`);

    setStage("verify", "Confirming the seeded accounts and marking the demo data complete.");
    verifyEmailsImmediately(DEMO_ACCOUNTS.map((account) => account.uid));
    markSeeded(true);
    completeStage("verify", "The demo data is complete.");

    return { qrs: products.length, sold: soldRecords.length };
  });
}

export async function seedIfNeeded() {
  const meta = await getMeta();
  setStage("check", "Checking for previously prepared demo data.");
  if (meta?.seeded && meta?.schemaVersion === SCHEMA_VERSION && meta?.seed === SEED_NAME) {
    completeStage("check", "Existing demo data found — reusing it instead of rebuilding.");
    finishPreparation({
      reused: true,
      detail: "Existing demo data was reused, so nothing had to be rebuilt.",
    });
    return { seeded: false, meta };
  }
  completeStage("check", "No usable demo data found, preparing a fresh dataset.");
  setStage("reset", "Removing any partial records so the sample data stays free of duplicates.");
  await resetDatabase();
  completeStage("reset", "Starting from an empty, consistent dataset.");
  const result = await seedAll();
  const nextMeta = {
    schemaVersion: SCHEMA_VERSION,
    seed: SEED_NAME,
    seeded: true,
    seededAt: nowIso(),
    qrCount: result.qrs,
    soldCount: result.sold,
  };
  await setMeta(nextMeta);
  finishPreparation({
    detail: "All sample shops, customers, warranties, claims and chat history are loaded.",
  });
  return { seeded: true, meta: nextMeta, ...result };
}

export async function reseedEverything() {
  await resetDatabase();
  const result = await seedAll();
  await setMeta({
    schemaVersion: SCHEMA_VERSION,
    seed: SEED_NAME,
    seeded: true,
    seededAt: nowIso(),
    qrCount: result.qrs,
    soldCount: result.sold,
  });
  return result;
}

let ensurePromise = null;
let ensureGeneration = 0;

export function ensureSeeded() {
  if (!ensurePromise) {
    const generation = (ensureGeneration += 1);
    ensurePromise = seedIfNeeded().catch((error) => {
      if (generation === ensureGeneration) {
        ensurePromise = null;
        failPreparation(error);
      }
      throw error;
    });
  }
  return ensurePromise;
}

export async function seedSummary() {
  const counts = await query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'merchant') AS shops,
      (SELECT COUNT(*) FROM qrs) AS qrs,
      (SELECT COUNT(*) FROM sales) AS sales,
      (SELECT COUNT(*) FROM claims) AS claims,
      (SELECT COUNT(*) FROM payments) AS payments,
      (SELECT COUNT(*) FROM support_threads) AS threads,
      (SELECT COUNT(*) FROM notifications) AS notifications
  `);
  return counts.rows?.[0] || null;
}

export { CUSTOMERS, SHOPS };
