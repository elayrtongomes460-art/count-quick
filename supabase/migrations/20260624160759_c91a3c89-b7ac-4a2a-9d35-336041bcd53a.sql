
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Itens
CREATE TABLE public.itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto TEXT NOT NULL UNIQUE,
  part_number TEXT NOT NULL DEFAULT '',
  designacao TEXT NOT NULL,
  quantidade_un NUMERIC NOT NULL DEFAULT 0,
  unidade_un TEXT NOT NULL DEFAULT 'UN',
  localizacao TEXT NOT NULL DEFAULT '',
  preco_medio_pond NUMERIC NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itens TO authenticated;
GRANT ALL ON public.itens TO service_role;
ALTER TABLE public.itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read itens" ON public.itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert itens" ON public.itens FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);
CREATE POLICY "auth update itens" ON public.itens FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete itens" ON public.itens FOR DELETE TO authenticated USING (true);
CREATE INDEX itens_produto_idx ON public.itens(produto);
CREATE INDEX itens_part_number_idx ON public.itens(part_number);

-- Inventarios
CREATE TABLE public.inventarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_inventario TEXT NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  responsavel TEXT NOT NULL,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'Em andamento' CHECK (status IN ('Em andamento','Finalizado')),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventarios TO authenticated;
GRANT ALL ON public.inventarios TO service_role;
ALTER TABLE public.inventarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own inventarios" ON public.inventarios FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Inventario itens
CREATE TABLE public.inventario_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id UUID NOT NULL REFERENCES public.inventarios(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.itens(id),
  produto TEXT NOT NULL,
  part_number TEXT,
  designacao TEXT,
  quantidade_un_sistema NUMERIC NOT NULL DEFAULT 0,
  unidade_un TEXT,
  localizacao TEXT,
  preco_medio_pond NUMERIC NOT NULL DEFAULT 0,
  quantidade_contada NUMERIC NOT NULL DEFAULT 0,
  diferenca NUMERIC NOT NULL DEFAULT 0,
  valor_divergencia NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inventario_id, produto)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_itens TO authenticated;
GRANT ALL ON public.inventario_itens TO service_role;
ALTER TABLE public.inventario_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own inventario itens"
  ON public.inventario_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventarios i WHERE i.id = inventario_id AND i.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inventarios i WHERE i.id = inventario_id AND i.user_id = auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER itens_updated_at BEFORE UPDATE ON public.itens FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER inventarios_updated_at BEFORE UPDATE ON public.inventarios FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER inventario_itens_updated_at BEFORE UPDATE ON public.inventario_itens FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
