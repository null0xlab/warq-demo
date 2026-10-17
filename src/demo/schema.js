export const SCHEMA_VERSION = "warq-demo-1";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(128)
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(128) PRIMARY KEY,
    email VARCHAR(255),
    name VARCHAR(160),
    shop_name VARCHAR(200),
    photo_url TEXT,
    bio TEXT,
    mobile VARCHAR(50),
    shop_address TEXT,
    delivery_address TEXT,
    same_as_shop_address BOOLEAN DEFAULT TRUE,
    district VARCHAR(100),
    upazila VARCHAR(100),
    role VARCHAR(40) DEFAULT 'merchant',
    subscription_status VARCHAR(40) DEFAULT 'inactive',
    subscription_plan VARCHAR(64),
    subscription_plan_name VARCHAR(160),
    subscription_purchased_at TIMESTAMPTZ,
    subscription_ends_at TIMESTAMPTZ,
    access_start_at TIMESTAMPTZ,
    access_revoked_at TIMESTAMPTZ,
    granted_free_access_duration JSONB,
    access_duration JSONB,
    unlimited_access BOOLEAN DEFAULT FALSE,
    disabled BOOLEAN DEFAULT FALSE,
    disabled_at TIMESTAMPTZ,
    banned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);
CREATE INDEX IF NOT EXISTS idx_users_sub ON users(subscription_status, subscription_ends_at);

CREATE TABLE IF NOT EXISTS qr_groups (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL,
    request_id VARCHAR(128),
    folder_name VARCHAR(255) NOT NULL,
    folder_name_key VARCHAR(255) NOT NULL,
    product_name VARCHAR(255),
    product_model VARCHAR(255),
    brand_name VARCHAR(255),
    product_names JSONB DEFAULT '[]'::jsonb,
    product_count INT DEFAULT 1,
    total_qrs INT DEFAULT 0,
    next_serial INT DEFAULT 0,
    shop_name VARCHAR(255),
    shop_address TEXT,
    deletion_state VARCHAR(32) DEFAULT 'normal',
    deletion_aborted_at TIMESTAMPTZ,
    deletion_failed_at TIMESTAMPTZ,
    last_added_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_groups_owner ON qr_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_qr_groups_folder_key ON qr_groups(owner_id, folder_name_key);

CREATE TABLE IF NOT EXISTS qr_folder_names (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL,
    folder_name VARCHAR(255) NOT NULL,
    folder_name_key VARCHAR(255) NOT NULL,
    group_id VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folder_names_lookup ON qr_folder_names(owner_id, folder_name_key);

CREATE TABLE IF NOT EXISTS sticker_requests (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL,
    shop_name VARCHAR(255),
    shop_address TEXT,
    folder_name VARCHAR(255),
    folder_name_key VARCHAR(255),
    target_group_id VARCHAR(128),
    products JSONB DEFAULT '[]'::jsonb,
    product_count INT DEFAULT 1,
    total_qr_codes INT DEFAULT 0,
    total_sticker_quantity INT DEFAULT 0,
    fulfillment VARCHAR(32) DEFAULT 'digital',
    sticker_pack_size INT DEFAULT 300,
    sticker_pack_price NUMERIC(12, 2) DEFAULT 50,
    per_sticker_price NUMERIC(12, 6) DEFAULT 0.166667,
    sticker_subtotal NUMERIC(12, 2) DEFAULT 0,
    delivery_charge NUMERIC(12, 2) DEFAULT 0,
    total_price NUMERIC(12, 2) DEFAULT 0,
    status VARCHAR(32) DEFAULT 'generated',
    generation_key VARCHAR(128),
    folder_serial_start INT DEFAULT 0,
    generated_at TIMESTAMPTZ,
    generated_by VARCHAR(128),
    generation_error TEXT,
    generation_started_at TIMESTAMPTZ,
    generation_started_by VARCHAR(128),
    generation_failed_at TIMESTAMPTZ,
    payment_status VARCHAR(32) DEFAULT 'not_required',
    payment_id VARCHAR(128),
    paid_at TIMESTAMPTZ,
    delivery_status VARCHAR(32) DEFAULT 'digital_ready',
    upgraded_to_physical_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sticker_requests_owner ON sticker_requests(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS qrs (
    id VARCHAR(128) PRIMARY KEY,
    code VARCHAR(128) UNIQUE NOT NULL,
    owner_id VARCHAR(128) NOT NULL,
    request_id VARCHAR(128),
    group_id VARCHAR(128),
    folder_name VARCHAR(255),
    serial INT NOT NULL,
    product_id VARCHAR(64),
    product_name VARCHAR(255) NOT NULL,
    product_model VARCHAR(255),
    brand_name VARCHAR(255),
    default_price NUMERIC(12, 2),
    cost_price NUMERIC(12, 2),
    actual_price NUMERIC(12, 2),
    warranty_duration JSONB,
    shop_name VARCHAR(255),
    shop_address TEXT,
    notes TEXT,
    status VARCHAR(32) DEFAULT 'generated',
    sale_id VARCHAR(128),
    customer_name VARCHAR(160),
    customer_phone VARCHAR(50),
    customer_email VARCHAR(160),
    customer_address TEXT,
    customer_notes TEXT,
    sale_date TIMESTAMPTZ,
    sold_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    activation_date TIMESTAMPTZ,
    activated_by VARCHAR(128),
    warranty_expires_at TIMESTAMPTZ,
    warranty_voided_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    returned_by VARCHAR(128),
    return_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qrs_code ON qrs(code);
CREATE INDEX IF NOT EXISTS idx_qrs_owner_status ON qrs(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_qrs_group ON qrs(group_id);
CREATE INDEX IF NOT EXISTS idx_qrs_request ON qrs(request_id);
CREATE INDEX IF NOT EXISTS idx_qrs_warranty_exp ON qrs(warranty_expires_at);

CREATE TABLE IF NOT EXISTS sales (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL,
    qr_id VARCHAR(128),
    code VARCHAR(128) NOT NULL,
    request_id VARCHAR(128),
    product_id VARCHAR(64),
    product_name VARCHAR(255) NOT NULL,
    product_model VARCHAR(255),
    brand_name VARCHAR(255),
    serial INT,
    default_price NUMERIC(12, 2),
    cost_price NUMERIC(12, 2),
    actual_price NUMERIC(12, 2),
    customer_name VARCHAR(160),
    customer_phone VARCHAR(50),
    customer_email VARCHAR(160),
    customer_address TEXT,
    customer_notes TEXT,
    sale_date TIMESTAMPTZ NOT NULL,
    sold_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    activation_date TIMESTAMPTZ,
    activated_by VARCHAR(128),
    warranty_duration JSONB,
    warranty_expires_at TIMESTAMPTZ,
    warranty_voided_at TIMESTAMPTZ,
    status VARCHAR(32) DEFAULT 'activated',
    returned_at TIMESTAMPTZ,
    returned_by VARCHAR(128),
    return_reason TEXT,
    shop_name VARCHAR(255),
    shop_address TEXT,
    edited_by VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_owner_date ON sales(owner_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_qr ON sales(qr_id);
CREATE INDEX IF NOT EXISTS idx_sales_code ON sales(code);

CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    package_id VARCHAR(64),
    package_name VARCHAR(128),
    sticker_request_id VARCHAR(128),
    kind VARCHAR(32) DEFAULT 'subscription',
    currency VARCHAR(16) DEFAULT 'BDT',
    amount NUMERIC(12, 2) NOT NULL,
    status VARCHAR(32) DEFAULT 'pending',
    gateway_payment_id VARCHAR(128),
    gateway_transaction_id VARCHAR(128),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_gateway ON payments(gateway_payment_id);

CREATE TABLE IF NOT EXISTS access_requests (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL,
    status VARCHAR(32) DEFAULT 'pending',
    message TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(128),
    admin_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_requests_owner ON access_requests(owner_id, status);

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(128) PRIMARY KEY,
    recipient_id VARCHAR(128) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(32) DEFAULT 'info',
    audience VARCHAR(64),
    created_by VARCHAR(128),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(128) PRIMARY KEY,
    actor_id VARCHAR(128) NOT NULL,
    action VARCHAR(128) NOT NULL,
    target_id VARCHAR(128),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);

CREATE TABLE IF NOT EXISTS support_threads (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL,
    status VARCHAR(32) DEFAULT 'open',
    subject VARCHAR(255),
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT,
    unread_by_admin INT DEFAULT 0,
    unread_by_user INT DEFAULT 0,
    admin_joined_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(128),
    assigned_admin_id VARCHAR(128),
    user_name VARCHAR(160),
    user_email VARCHAR(255),
    user_shop_name VARCHAR(200),
    user_mobile VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_threads_owner ON support_threads(owner_id, status);

CREATE TABLE IF NOT EXISTS support_messages (
    id VARCHAR(128) PRIMARY KEY,
    thread_id VARCHAR(128) NOT NULL,
    sender_id VARCHAR(128) NOT NULL,
    sender_role VARCHAR(32) DEFAULT 'customer',
    text TEXT,
    message TEXT,
    image_id VARCHAR(128),
    reply_to JSONB,
    deleted BOOLEAN DEFAULT FALSE,
    deleted_type VARCHAR(32),
    deleted_at TIMESTAMPTZ,
    edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON support_messages(thread_id, created_at ASC);

CREATE TABLE IF NOT EXISTS support_images (
    id VARCHAR(128) PRIMARY KEY,
    thread_id VARCHAR(128),
    owner_id VARCHAR(128),
    uploader_id VARCHAR(128) NOT NULL,
    file_name VARCHAR(255),
    filename VARCHAR(255),
    mime_type VARCHAR(64),
    size INT,
    size_bytes INT,
    file_path TEXT,
    data_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_images_thread ON support_images(thread_id);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL,
    role VARCHAR(32) NOT NULL,
    content TEXT,
    deleted BOOLEAN DEFAULT FALSE,
    deleted_type VARCHAR(32),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_owner ON ai_chat_messages(owner_id, created_at ASC);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
    key VARCHAR(128) PRIMARY KEY,
    failure_count INT DEFAULT 0,
    window_started_at BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claims (
    id VARCHAR(128) PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    owner_id VARCHAR(128) NOT NULL,
    qr_id VARCHAR(128),
    qr_code VARCHAR(128) NOT NULL,
    customer_user_id VARCHAR(128),
    customer_name VARCHAR(160),
    customer_phone VARCHAR(50),
    customer_email VARCHAR(160),
    category VARCHAR(64) DEFAULT 'repair',
    description TEXT,
    status VARCHAR(32) DEFAULT 'submitted',
    resolution_note TEXT,
    reviewed_by VARCHAR(128),
    reviewed_at TIMESTAMPTZ,
    timeline JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claims_owner ON claims(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_code ON claims(code);
CREATE INDEX IF NOT EXISTS idx_claims_qr ON claims(qr_code);
`;

export const TABLE_NAMES = [
  "claims",
  "email_verification_tokens",
  "admin_login_attempts",
  "ai_chat_messages",
  "support_images",
  "support_messages",
  "support_threads",
  "audit_logs",
  "notifications",
  "access_requests",
  "payments",
  "sales",
  "qrs",
  "sticker_requests",
  "qr_folder_names",
  "qr_groups",
  "users",
  "system_settings",
];
