-- Permite buscar uma venda por CPF/CNPJ do cliente em /entradas. Kiwify e
-- Ticto já mandam esse dado no payload (Customer.CPF/cnpj, customer.cpf/cnpj)
-- e o export de CSV da Kiwify traz na coluna "CPF / CNPJ" — só nunca foi
-- salvo em lugar nenhum até agora.
alter table revenue_entries add column if not exists customer_document text;
