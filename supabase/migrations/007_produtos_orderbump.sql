-- Marca produtos que são order bump (vendidos junto com um produto principal,
-- mas registrados como item separado nas plataformas). A classificação é por
-- produto, não por payload: não há ainda um exemplo real de webhook com order
-- bump pra saber como a Kiwify/Ticto marcam isso no JSON (ver dashboard-kiwify-spec.md),
-- então o critério confiável disponível hoje é "este produto, pelo nome, é sempre
-- vendido como order bump" — configurado manualmente em /produtos.
alter table produtos add column if not exists is_orderbump boolean not null default false;
