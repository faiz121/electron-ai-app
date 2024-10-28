const http = require('http');

function checkQdrant() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:6333/healthz', (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        reject(new Error(`Qdrant health check failed: ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

async function main() {
  try {
    await checkQdrant();
    console.log('Qdrant is healthy');
    process.exit(0);
  } catch (error) {
    console.error('Health check failed:', error);
    process.exit(1);
  }
}

main();