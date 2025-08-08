import fs from 'fs';

const res = await fetch('https://api.attio.com/openapi/api');
const data = await res.json();
fs.writeFileSync('attio_openapi.json', JSON.stringify(data, null, 2));
console.log('✅ OpenAPI spec saved as attio_openapi.json');
