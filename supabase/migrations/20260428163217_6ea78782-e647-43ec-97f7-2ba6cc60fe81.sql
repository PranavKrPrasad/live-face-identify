CREATE TABLE public.faces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  descriptor JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.faces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view faces" ON public.faces FOR SELECT USING (true);
CREATE POLICY "Anyone can insert faces" ON public.faces FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete faces" ON public.faces FOR DELETE USING (true);