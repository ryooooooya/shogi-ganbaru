-- 棋譜テーブル
create table games (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz default now(),
  game_date    timestamptz,
  my_side      text,
  opponent     text,
  total_moves  int,
  result       text,
  my_sentype   text,
  opp_sentype  text,
  kif_raw      text
);

-- AI分析結果テーブル
create table analyses (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid references games(id) on delete cascade,
  created_at timestamptz default now(),
  comment    text
);

create index on games(game_date desc);
create index on games(result);
create index on games(my_sentype);
create index on games(opp_sentype);
