const { google } = require('googleapis');
const CryptoJS = require('crypto-js');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT;
const MASTER_SPREADSHEET_ID = process.env.MASTER_SPREADSHEET_ID;

if (!SERVICE_ACCOUNT_JSON) {
  console.error('ERROR: GOOGLE_SERVICE_ACCOUNT secret is not set');
  process.exit(1);
}

if (!MASTER_SPREADSHEET_ID) {
  console.error('ERROR: MASTER_SPREADSHEET_ID is not set');
  process.exit(1);
}

async function main() {
  try {
    const credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
    
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    console.log('Reading Master Spreadsheet...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: MASTER_SPREADSHEET_ID,
      range: 'Sheet1!A2:S',
    });
    
    const rows = response.data.values || [];
    console.log(`Found ${rows.length} product rows`);
    
    if (rows.length === 0) {
      console.log('No data found. Exiting.');
      return;
    }
    
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    let filesCreated = 0;
    let filesSkipped = 0;
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      const salesOrderNo = (row[2] || '').toString().trim();
      const itemNo = (row[5] || '').toString().trim();
      const encryptionKey = (row[18] || '').toString().trim();
      
      if (!salesOrderNo || !itemNo) {
        console.log(`Row ${i + 2}: Skipping - missing SO or ItemNo`);
        filesSkipped++;
        continue;
      }
      
      if (!encryptionKey) {
        console.log(`Row ${i + 2}: Skipping ${salesOrderNo}/${itemNo} - no encryption key yet`);
        filesSkipped++;
        continue;
      }
      
      const productData = {
        salesOrderNo: salesOrderNo,
        itemNo: itemNo,
        customerName: (row[3] || '').toString().trim(),
        itemNameMain: (row[6] || '').toString().trim(),
        itemNameSub: (row[7] || '').toString().trim(),
        dimension: (row[8] || '').toString().trim(),
        quantity: (row[9] || '').toString().trim(),
        unitOfMeasurement: (row[10] || '').toString().trim(),
        estimatedDeliveryDate: (row[11] || '').toString().trim()
      };
      
      const jsonString = JSON.stringify(productData);
      const encrypted = CryptoJS.AES.encrypt(jsonString, encryptionKey).toString();
      
      const cleanSO = salesOrderNo.replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanItem = itemNo.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanItem}_${cleanSO}.enc`;
      const filePath = path.join(dataDir, filename);
      
      fs.writeFileSync(filePath, encrypted, 'utf8');
      console.log(`Row ${i + 2}: Created ${filename}`);
      filesCreated++;
    }
    
    console.log(`\nDone! Created ${filesCreated} files, skipped ${filesSkipped} rows.`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
