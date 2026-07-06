import { latLngToCell } from 'h3-js';
import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('./public/data/precincts-2020.json', 'utf8'));

for (let res = 2; res <= 6; res++) {
  const hexes = new Set(data.map(c => latLngToCell(c.lat, c.lng, res)));
  console.log(`Resolution ${res}: ${hexes.size} populated hexes`);
}

// Also show what res gives ~435 hexes
console.log('\n435 House seats for reference');
