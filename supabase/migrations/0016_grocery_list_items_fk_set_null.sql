-- grocery_list_items.deal_id / store_id n'avaient pas de comportement
-- ON DELETE explicite (donc RESTRICT par défaut) : supprimer un deal (le
-- scraper le fait maintenant à chaque run, voir scrape-store/index.ts) ou un
-- magasin (nouvelle option "Retirer" dans l'onglet Magasins) référencé par
-- une liste d'épicerie existante ferait échouer la suppression. Une liste
-- d'épicerie passée reste utile même si son deal/magasin d'origine a
-- disparu (l'item garde son nom/quantité) — on passe donc la référence à
-- null plutôt que de bloquer la suppression.
alter table grocery_list_items drop constraint grocery_list_items_deal_id_fkey;
alter table grocery_list_items add constraint grocery_list_items_deal_id_fkey
  foreign key (deal_id) references deals on delete set null;

alter table grocery_list_items drop constraint grocery_list_items_store_id_fkey;
alter table grocery_list_items add constraint grocery_list_items_store_id_fkey
  foreign key (store_id) references stores on delete set null;
