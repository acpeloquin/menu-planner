-- Permet de retirer un magasin entièrement (pas juste ne plus le suivre)
-- depuis l'onglet Magasins. Les magasins sont une entité partagée en
-- lecture ("stores_select_authenticated" existant) — on aligne la
-- suppression sur la même politique plutôt que de la restreindre au seul
-- créateur, puisque les magasins pré-remplis par migration (Dessaulles,
-- IGA, Maxi, Super C) n'ont pas de created_by.
create policy "stores_delete_authenticated" on stores for delete to authenticated using (true);
