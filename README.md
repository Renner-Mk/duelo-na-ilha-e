# Duelo na Ilha

Duelo tático 1v1 em grade 5x5: empurre, puxe e bloqueie. Quem cair da ilha perde.
Jogo web (Node + Express + Socket.io), com modo local (mesmo aparelho) e online (sala por código).

## Rodar localmente

```bash
npm install
npm start        # http://localhost:3000
npm run check    # testes das regras
```

## Deploy no Render

1. Suba este projeto para um repositório no GitHub.
2. No Render: **New → Blueprint** (usa o `render.yaml`) ou **New → Web Service** com:
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/health`
3. Abra o endereço `https://….onrender.com`. O HTTPS já vem ativo.

Observações:
- As salas ficam na memória do processo: um novo deploy ou reinício encerra as partidas em andamento.
- No plano grátis o serviço hiberna após ~15 min sem acessos e leva ~30 s para acordar.
- Link de convite: `https://seu-endereco/?sala=ABCD`.
