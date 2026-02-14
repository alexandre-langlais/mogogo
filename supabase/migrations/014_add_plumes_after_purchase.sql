-- RPC dédiée aux achats IAP (traçabilité distincte de credit_plumes)
CREATE OR REPLACE FUNCTION public.add_plumes_after_purchase(p_device_id text, p_amount integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO public.device_plumes (device_id, plumes_count, updated_at)
  VALUES (p_device_id, 30 + p_amount, now())
  ON CONFLICT (device_id) DO UPDATE
    SET plumes_count = device_plumes.plumes_count + p_amount,
        updated_at = now()
  RETURNING plumes_count INTO new_count;
  RETURN new_count;
END;
$$;
