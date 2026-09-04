# Conectar o Power BI ao RiscoZero

Guia para montar relatórios em cima dos dados do sistema, com atualização
automática — sem exportar CSV na mão toda semana.

Serve igual para Looker Studio, Excel ou qualquer ferramenta que leia JSON de
uma URL. Os exemplos usam Power BI porque é o mais comum na indústria.

---

## Antes de começar: o que sai e o que não sai

**Sai:** setor, turno, as quatro notas, o índice de risco já calculado, o nível
(baixo/médio/alto) e a data de envio.

**Não sai:** o comentário em texto livre. Nunca.

Isso não é limitação técnica, é decisão de projeto. O comentário é o único
campo capaz de identificar quem respondeu — no painel ele só aparece quando
está diluído entre outros do mesmo setor. Numa exportação, quem recebe o
arquivo decide sozinho o que mostrar, e a promessa de anonimato feita a quem
preencheu o formulário sairia das nossas mãos.

Se alguém pedir os comentários no relatório, a resposta é essa.

---

## Passo 1: criar uma chave de acesso

Só administrador cria chave. A chave é o que o Power BI usa para entrar — o
login normal não serve, porque expira em 8 horas e a atualização agendada
roda de madrugada.

Com o servidor no ar, faça login e chame:

```bash
# 1. Pegue seu token de login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@riscozero.local","senha":"sua-senha"}'

# 2. Crie a chave (troque SEU_TOKEN pelo campo "token" da resposta acima)
curl -X POST http://localhost:3000/api/bi/chaves \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Power BI do RH","dias":90}'
```

A resposta traz o campo `chave`, mais ou menos assim:

```json
{
  "nome": "Power BI do RH",
  "chave": "rzbi_a1b2c3d4...",
  "expiraEm": "2026-12-03T12:00:00.000Z",
  "aviso": "Guarde esta chave agora. Ela não será mostrada de novo."
}
```

**Guarde na hora.** O sistema só grava o hash — não existe como recuperar o
valor depois. Se perder, revogue a chave e crie outra.

`dias` é opcional (padrão 90, máximo 365).

---

## Passo 2: conectar no Power BI

**Obter Dados → Web → Avançado**

- **URL:** `https://seu-endereco/api/bi/serie?porSetor=true`
- **Cabeçalho:** `Authorization` com valor `Bearer rzbi_a1b2c3d4...`

Clique OK, expanda a coluna `dados` e transforme em tabela. Pronto.

Se preferir escrever direto no editor avançado:

```
let
    Origem = Json.Document(
        Web.Contents(
            "https://seu-endereco/api/bi/serie",
            [
                Query   = [porSetor = "true"],
                Headers = [#"Authorization" = "Bearer rzbi_a1b2c3d4..."]
            ]
        )
    ),
    Tabela = Table.FromRecords(Origem[dados])
in
    Tabela
```

---

## As três consultas disponíveis

Todas aceitam `?de=AAAA-MM-DD` e `?ate=AAAA-MM-DD`. Sem esses parâmetros,
devolvem o período inteiro.

### `/api/bi/serie` — índice dia a dia

A mais útil para gráfico de linha. Com `?porSetor=true`, devolve uma linha por
dia **e** setor, que é o que permite comparar setores no mesmo gráfico.

### `/api/bi/agregado` — médias por setor e por turno

Duas tabelas prontas (`porSetor` e `porTurno`), cada linha já com total,
médias dos quatro indicadores, índice e nível. Boa para cartões e barras.

### `/api/bi/completo` — uma linha por resposta

Os dados crus, para quem quer fazer os próprios agrupamentos. Vem paginado
(5.000 linhas por página no máximo): use `?pagina=2`, e o campo `temMais`
indica se ainda há o que buscar.

---

## Passo 3: agendar a atualização

No Power BI Service: **Configurações do conjunto de dados → Atualização
agendada**. Uma vez por dia costuma bastar — as respostas chegam ao longo do
turno, e o índice de um setor não muda de forma relevante de hora em hora.

Se o RiscoZero estiver no Render no plano gratuito, o servidor dorme após um
tempo sem uso e leva até um minuto para acordar. A primeira chamada pode dar
tempo esgotado; a atualização seguinte funciona. Vale agendar com folga.

---

## Cuidando das chaves

```bash
# Ver todas (não mostra os valores, só quando cada uma foi usada)
curl http://localhost:3000/api/bi/chaves -H "Authorization: Bearer SEU_TOKEN"

# Revogar
curl -X DELETE http://localhost:3000/api/bi/chaves/ID_DA_CHAVE \
  -H "Authorization: Bearer SEU_TOKEN"
```

A listagem mostra `ultimoUso` de cada chave. Uma que ninguém usa há meses
provavelmente ficou num relatório que não existe mais — revogue.

Revogar não apaga o registro: fica gravado que a chave existiu e quando
deixou de valer, senão a auditoria perderia o rastro. E a revogação vale na
hora, sem derrubar o login de ninguém.

**Uma chave por ferramenta.** Se todas as áreas usarem a mesma, revogar por
causa de um vazamento derruba os relatórios de todo mundo junto.

---

## Quando algo não funciona

| O que aparece | O que é |
|---|---|
| `401 Chave de acesso inválida ou expirada` | Chave errada, revogada ou vencida. A mensagem é a mesma nos três casos de propósito — dizer qual ajudaria quem está testando chaves. |
| `401 É preciso enviar uma chave de acesso` | O cabeçalho `Authorization` não chegou. No Power BI, confira que foi digitado em **Avançado**, não no campo simples de URL. |
| `403` ao criar chave | A conta não é admin. |
| Tempo esgotado na primeira atualização | Servidor dormindo (Render gratuito). Tente de novo. |
| Tabela vazia | O filtro `de`/`ate` não pegou nenhuma resposta. Confira o formato: `AAAA-MM-DD`. |
