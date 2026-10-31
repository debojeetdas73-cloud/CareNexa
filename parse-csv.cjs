const fs = require('fs');
const path = require('path');

const csv = fs.readFileSync('medicine/medicine_dataset_5000.csv', 'utf-8');
const lines = csv.trim().split('\n');

const medicines = [];
for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.trim());
    if (parts.length >= 3) {
        medicines.push({
            name: parts[0],
            genericName: parts[1],
            category: parts[2]
        });
    }
}

console.log(`Parsed ${medicines.length} medicines`);
console.log('First medicine:', medicines[0]);
console.log('Last medicine:', medicines[medicines.length - 1]);

// Generate TypeScript code
const tsCode = `export interface Medicine {
  name: string;
  genericName: string;
  category: string;
}

export const allMedicines: Medicine[] = ${JSON.stringify(medicines, null, 2)};
`;

fs.writeFileSync('src/data/medicines.ts', tsCode);
console.log('✓ Created src/data/medicines.ts');
