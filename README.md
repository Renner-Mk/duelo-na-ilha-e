# Duelo na Ilha

Jogo tático em grade com ataques telegrafados (você vê a mira do rival antes de reagir). Web (Node + Express +
Socket.io), feito para celular. Três jeitos de jogar:

- **Duelo 1v1 (5x5)**, no mesmo aparelho ou online (sala por código).
- **Coop contra bots (7x7)**, você e um amigo no mesmo time, por fases que ficam mais difíceis. Cada fase limpa dá
  uma melhoria (escolha 1 de 3 por jogador). Pode ser online (cada um no seu aparelho) ou num aparelho só.

## Regras em uma olhada
- **Golpes:** Empurrão (1 de dano e recua 1 casa), Gancho (puxa o primeiro alvo da linha, até 3 casas) e Investida
  (avança até 2 casas; quem passa por um buraco cai).
- **Ordem de resolução:** Investida → Gancho → Empurrão. Empate: quem atacou (no coop, os bots) vai primeiro.
- **Terreno:** montanhas (2 golpes para quebrar), casas rachadas (quebram e derrubam), molas (lançam 2 casas) e
  buracos (no máximo 3).
- **Coop:** os bots andam e telegrafam; os dois jogadores planejam ao mesmo tempo; quem cai volta na fase seguinte
  com 1 de vida; o jogo acaba quando os dois caem na mesma fase. Chefão a cada 5 fases.

## Rodar localmente
```bash
npm install
npm start            # http://localhost:3000
npm run check        # testes: regras do duelo, regras do coop e servidor online (precisa de rede local)
node scripts/balance.mjs 20 1 250 0.3   # simulação de equilíbrio do coop (distração de 30%)
```
`/dev-coop.html` mostra as fases do coop (inimigos, telegrafes) sem precisar jogar.

## Estrutura
- `shared/rules.js` motor do duelo e dos golpes · `shared/coop.js` fases, rodada e melhorias do coop ·
  `shared/bots.js` IA dos bots · `server/index.js` salas, planos simultâneos e reconexão ·
  `public/` interface (SVG/CSS, sem arquivos externos).

## Deploy no Render
1. Suba o projeto para um repositório no GitHub.
2. No Render: **New → Web Service** (ou **Blueprint**, que usa o `render.yaml`) com:
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/health`
3. Abra o endereço `https://….onrender.com`. O HTTPS já vem ativo.

Observações:
- As salas ficam na memória do processo: um novo deploy ou reinício encerra as partidas em andamento.
- Quem perde a conexão tem 60 s para voltar à mesma vaga (variável `GRACE_MS` muda esse tempo).
- No plano grátis o serviço hiberna após ~15 min sem acessos e leva ~30 s para acordar.
- Link de convite: `https://seu-endereco/?sala=ABCD`.

## Branches
`main` é o v1 (duelo, tag `v1.0`); `v2` traz o modo coop.
