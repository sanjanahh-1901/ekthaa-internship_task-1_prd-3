const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');

const generateHtmlTemplate = (title, markdownContent) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      max-width: 820px;
      margin: 0 auto;
      padding: 2.5rem;
      background: #ffffff;
    }
    h1 {
      font-size: 2.2rem;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 0.5rem;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 0.8rem;
    }
    h2 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1e293b;
      margin-top: 2rem;
      margin-bottom: 1rem;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 0.4rem;
    }
    h3 {
      font-size: 1.15rem;
      font-weight: 600;
      color: #334155;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
    }
    p {
      margin-bottom: 1.25rem;
      color: #334155;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
      font-size: 0.9rem;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 10px 12px;
      text-align: left;
    }
    th {
      background-color: #f8fafc;
      font-weight: 700;
      color: #0f172a;
    }
    tr:nth-child(even) td {
      background-color: #f8fafc;
    }
    blockquote {
      border-left: 4px solid #6366f1;
      background: #f8fafc;
      padding: 0.75rem 1.25rem;
      margin: 1.5rem 0;
      color: #475569;
      border-radius: 0 8px 8px 0;
    }
    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 1.2rem;
      border-radius: 10px;
      overflow-x: auto;
      margin: 1.5rem 0;
      font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
      font-size: 0.85rem;
    }
    code {
      font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
      background: #f1f5f9;
      color: #ef4444;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.85rem;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
      font-size: inherit;
    }
    hr {
      border: 0;
      height: 1px;
      background: #e2e8f0;
      margin: 2.5rem 0;
    }
    .grad-text {
      background: linear-gradient(135deg, #8b5cf6, #6366f1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 800;
    }
    /* Page break adjustments for PDF printing */
    h1, h2, h3 {
      page-break-after: avoid;
    }
    pre, table, blockquote {
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div id="content"></div>
  <script>
    const markdown = \`${markdownContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
    document.getElementById('content').innerHTML = marked.parse(markdown);
  </script>
</body>
</html>
`;

async function main() {
  console.log('🔄 Loading Markdown files...');
  
  const file1 = path.join(rootDir, 'PRD_digital_scrapbook.md');
  const file2 = path.join(rootDir, 'PRD_qr_code_attendance.md');
  
  if (!fs.existsSync(file1) || !fs.existsSync(file2)) {
    throw new Error('PRD markdown files not found in the root directory.');
  }
  
  const content1 = fs.readFileSync(file1, 'utf8');
  const content2 = fs.readFileSync(file2, 'utf8');
  
  const htmlPath1 = path.join(rootDir, 'PRD_digital_scrapbook.html');
  const htmlPath2 = path.join(rootDir, 'PRD_qr_code_attendance.html');
  
  console.log('✍️ Generating HTML temporary templates...');
  fs.writeFileSync(htmlPath1, generateHtmlTemplate('PRD - Digital Scrapbook', content1));
  fs.writeFileSync(htmlPath2, generateHtmlTemplate('PRD - QR Code Attendance', content2));
  
  console.log('🌐 Launching local Chrome browser via Playwright...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });
  const page = await browser.newPage();
  
  // Print PRD 1
  console.log('🖨️ Printing PRD: Digital Scrapbook to PDF...');
  await page.goto('file:///' + htmlPath1.replace(/\\/g, '/'));
  await page.waitForSelector('#content p');
  await page.pdf({
    path: path.join(rootDir, 'PRD_digital_scrapbook.pdf'),
    format: 'A4',
    margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
    printBackground: true
  });
  
  // Print PRD 2
  console.log('🖨️ Printing PRD: QR Code Attendance to PDF...');
  await page.goto('file:///' + htmlPath2.replace(/\\/g, '/'));
  await page.waitForSelector('#content p');
  await page.pdf({
    path: path.join(rootDir, 'PRD_qr_code_attendance.pdf'),
    format: 'A4',
    margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
    printBackground: true
  });
  
  await browser.close();
  
  console.log('🧹 Cleaning up temporary HTML templates...');
  fs.unlinkSync(htmlPath1);
  fs.unlinkSync(htmlPath2);
  
  console.log('🎉 Both PRDs successfully printed as PDFs!');
}

main().catch(err => {
  console.error('❌ Failed to generate PDFs:', err);
  process.exit(1);
});
