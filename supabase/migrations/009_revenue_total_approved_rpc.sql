-- /entradas carregava a tabela revenue_entries inteira (76.898 linhas, ~55MB
-- de JSON, 5+ segundos) só pra montar uma lista e somar o líquido aprovado.
-- A página vira paginada (migration não mexe em dado, só adiciona a função
-- abaixo, usada pra calcular o total aprovado sem baixar todas as linhas).
--
-- Agregação nativa do PostgREST (?select=net_amount.sum()) está desligada
-- nesta instância ("Use of aggregate functions is not allowed"), então o
-- total é calculado aqui dentro do Postgres via função chamada por .rpc().
create or replace function revenue_total_approved(p_platform text default null)
returns numeric
language sql
stable
as $$
  select coalesce(sum(coalesce(net_amount, gross_amount)), 0)
  from revenue_entries
  where status = 'approved'
    and (p_platform is null or platform = p_platform)
$$;

grant execute on function revenue_total_approved(text) to anon, authenticated;
