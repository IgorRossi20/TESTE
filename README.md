# Ranking da Vara 🐟

Um app de ranking de pescaria com mural de capturas, comentários e curtidas, feito com HTML, TailwindCSS e Firebase.

## Como rodar

1. **Clone o repositório**
2. **Configure o Firebase**
   - Renomeie o arquivo `firebaseConfig.js` e preencha com suas credenciais do Firebase.
3. **Abra o arquivo `public/index.html` em seu navegador**

## Estrutura

- `public/index.html` — HTML principal
- `public/style.css` — CSS customizado
- `public/app.js` — Lógica do app
- `firebaseConfig.js` — Configuração do Firebase (adicione suas credenciais)

## Deploy

Você pode hospedar a pasta `public/` em qualquer serviço de hospedagem estática (Vercel, Netlify, Firebase Hosting, etc).

1. Configure o domínio permitido no Firebase Authentication (login anônimo).
2. Faça upload da pasta `public/` para o serviço de sua escolha.

## Observações
- O app usa login anônimo do Firebase.
- As capturas, curtidas e comentários são salvos no Firestore e Storage.
- Para produção, configure regras de segurança adequadas no Firebase.

---
Feito com �� para pescadores! 