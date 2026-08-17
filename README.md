# gabbswq.github.io

Meu site portfólio pessoal — hospedado no GitHub Pages.

🔗 **Live:** https://gabbswq.github.io

## Stack

- HTML5 + CSS puro (sem build, sem framework)
- Fontes do Google Fonts (Inter + JetBrains Mono)
- Animações de scroll com IntersectionObserver

## Estrutura

```
.
├── index.html    # Tudo em um único arquivo (HTML + CSS + JS embutidos)
└── README.md     # Este arquivo
```

## Newsletter com Supabase

O campo `Type your e-mail` já está preparado para salvar leads no Supabase.
Enquanto as chaves não forem preenchidas, ele salva apenas no navegador com `localStorage`.

Para ativar o banco:

1. Crie um projeto gratuito no Supabase.
2. Rode este SQL no editor:

```sql
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text default 'gabbswq.github.io',
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

create policy "Allow public newsletter inserts"
on public.newsletter_subscribers
for insert
to anon
with check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');
```

3. No `index.html`, preencha:

```js
window.PORTFOLIO_CONFIG = {
  supabaseUrl: "https://SEU-PROJETO.supabase.co",
  supabasePublishableKey: "SUA_PUBLISHABLE_OU_ANON_KEY",
  newsletterTable: "newsletter_subscribers"
};
```

Use somente a Publishable key/anon key no front-end. Nunca coloque `service_role` ou Secret key em site público.

## WhatsApp

O botão flutuante aponta para:

```text
https://wa.me/5542988365669
```

## Por quê single-file?

Porque ainda tô aprendendo, e dois arquivos é mais simples de manter do que vinte.
Quando o site crescer, separo em módulos.

---

Construído por [@gabbswq](https://github.com/gabbswq) · Curitiba 🇧🇷
