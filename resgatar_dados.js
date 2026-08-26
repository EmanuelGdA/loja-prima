const admin = require('firebase-admin');

// 1. Projeto ANTIGO (Origem)
const appAntigo = admin.initializeApp({
  credential: admin.credential.cert(require('./firebase-key-antiga.json'))
}, 'antigo');

// 2. Projeto NOVO (Destino - Maely Cristina Oficial)
const appNovo = admin.initializeApp({
  credential: admin.credential.cert(require('./firebase-key.json'))
}, 'novo');

const dbAntigo = appAntigo.firestore();
const dbNovo = appNovo.firestore();

// Coleções de texto que vamos resgatar
const colecoes = ['users', 'orders', 'reviews'];

async function resgatar() {
    console.log("Searching... 🕵️ Resgatando Clientes, Pedidos e Avaliações...");

    for (const nomeColecao of colecoes) {
        console.log(`📦 Processando: ${nomeColecao}...`);
        const snapshot = await dbAntigo.collection(nomeColecao).get();
        
        if (snapshot.empty) {
            console.log(`⚠️ Ninguém na coleção ${nomeColecao}.`);
            continue;
        }

        const batch = dbNovo.batch();
        let contador = 0;

        snapshot.forEach(doc => {
            const docRef = dbNovo.collection(nomeColecao).doc(doc.id);
            batch.set(docRef, doc.data());
            contador++;
        });

        await batch.commit();
        console.log(`✅ ${contador} registros movidos para ${nomeColecao}!`);
    }

    console.log("\n✨ DADOS RESGATADOS! Seus clientes e pedidos antigos já estão no banco novo.");
    process.exit();
}

resgatar().catch(err => {
    console.error("❌ Erro:", err);
    process.exit(1);
});
