-- The form now accepts 1 to 14 years ("Outro" covers ages above the chips).
alter table public.books drop constraint books_child_age_check;
alter table public.books add constraint books_child_age_check check (child_age between 1 and 14);
