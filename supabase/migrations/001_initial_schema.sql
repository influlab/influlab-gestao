-- Habilita extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Entradas de receita (Kiwify, Ticto, manual)
CREATE TABLE IF NOT EXISTS revenue_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform TEXT NOT NULL,
  product_name TEXT,
  gross_amount NUMERIC(12,2) NOT NULL,
  net_amount NUMERIC(12,2),
  customer_name TEXT,
  customer_email TEXT,
  transaction_id TEXT,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE revenue_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON revenue_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Gastos em anúncios
CREATE TABLE IF NOT EXISTS ad_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform TEXT NOT NULL,
  campaign_name TEXT,
  amount NUMERIC(12,2) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ad_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON ad_costs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Custos avulsos / variáveis
CREATE TABLE IF NOT EXISTS variable_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  date DATE NOT NULL,
  category TEXT,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE variable_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON variable_costs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Assinaturas recorrentes
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  billing_day INTEGER,
  category TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON subscriptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Custos fixos mensais
CREATE TABLE IF NOT EXISTS fixed_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  billing_day INTEGER,
  category TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fixed_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON fixed_costs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Prestadores de serviço
CREATE TABLE IF NOT EXISTS service_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  service_type TEXT,
  email TEXT,
  phone TEXT,
  payment_amount NUMERIC(12,2),
  payment_frequency TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON service_providers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
