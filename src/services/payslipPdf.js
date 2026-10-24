import PDFDocument from 'pdfkit';
import { roundMoney } from './payrollMath.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthLabel(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTHS[monthNumber - 1]} ${year}`;
}

function money(value) {
  const negative = value < 0;
  const rounded = Math.abs(roundMoney(value)).toFixed(2);
  const [whole, fraction] = rounded.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}.${fraction}`;
}

function linePair(doc, y, leftLabel, leftValue, rightLabel, rightValue, bold) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#111827');
  doc.text(leftLabel, 48, y, { width: 150 });
  doc.text(leftValue, 190, y, { width: 90, align: 'right' });
  doc.text(rightLabel, 310, y, { width: 150 });
  doc.text(rightValue, 460, y, { width: 80, align: 'right' });
}

// compress is off so the text stays readable in the file and in tests.
export function buildPayslipPdf(view) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, compress: false });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.rect(0, 0, 595, 92).fill('#14532d');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text(view.companyName, 48, 28, { width: 500 });
    doc.font('Helvetica').fontSize(12).text(`Payslip · ${monthLabel(view.month)}`, 48, 56);

    let y = 112;
    doc.fillColor('#111827').fontSize(11);
    doc.text(`${view.employeeName}  ·  ${view.employeeCode}`, 48, y);
    y += 16;
    doc.fontSize(10).fillColor('#374151');
    doc.text(`${view.departmentName || '—'}  ·  ${view.designationName || '—'}`, 48, y);
    y += 22;

    const inputs = view.breakdown.inputs;
    const proration = view.breakdown.proration;
    doc.fontSize(9).fillColor('#4b5563').text(
      `Working days ${inputs.workingDays}. Per day = ${money(inputs.grossMonthly)} / ${inputs.workingDays} = ${money(inputs.perDayRate)}.`,
      48,
      y,
      { width: 500 },
    );
    y += 14;
    if (proration.applied) {
      doc.text(
        `Paid for ${proration.employedWorkingDays} of ${proration.monthWorkingDays} working days (joined ${inputs.joinDate}${inputs.exitDate ? `, left ${inputs.exitDate}` : ''}).`,
        48,
        y,
        { width: 500 },
      );
      y += 14;
    }
    y += 8;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#14532d');
    doc.text('Earnings', 48, y);
    doc.text('Deductions', 310, y);
    y += 16;
    doc.moveTo(48, y).lineTo(547, y).strokeColor('#d1d5db').stroke();
    y += 8;

    const earnings = [
      ['Basic', view.breakdown.earnings.basic],
      ['HRA', view.breakdown.earnings.hra],
      ['Medical', view.breakdown.earnings.medical],
      ['Other allowances', view.breakdown.earnings.otherAllowances],
    ];
    const deductions = view.breakdown.lines.filter((row) => (
      row.label.endsWith('deduction') || row.label === 'Late penalty' || row.label === 'Income tax'
    )).filter((row) => row.amount !== 0 || row.label === 'Income tax');

    const rows = Math.max(earnings.length, deductions.length);
    for (let index = 0; index < rows; index += 1) {
      const earning = earnings[index];
      const deduction = deductions[index];
      linePair(
        doc,
        y,
        earning ? earning[0] : '',
        earning ? money(earning[1]) : '',
        deduction ? deduction.label : '',
        deduction ? money(deduction.amount) : '',
        false,
      );
      y += 16;
    }

    y += 4;
    doc.moveTo(48, y).lineTo(547, y).strokeColor('#d1d5db').stroke();
    y += 8;
    linePair(
      doc,
      y,
      'Gross',
      money(view.breakdown.earnings.gross),
      'Deductions + tax',
      money(roundMoney(view.breakdown.deductions.total + view.breakdown.tax.monthlyTax)),
      true,
    );
    y += 28;

    doc.font('Helvetica').fontSize(9).fillColor('#374151');
    doc.text(`Tax: ${view.breakdown.tax.formula}`, 48, y, { width: 500 });
    y += 28;
    doc.text(`Slab: ${view.breakdown.tax.slabLabel}`, 48, y, { width: 500 });
    y += 28;

    doc.roundedRect(48, y, 499, 48, 6).fill('#f0fdf4');
    doc.fillColor('#14532d').font('Helvetica-Bold').fontSize(14).text('Net pay', 64, y + 14);
    doc.fontSize(16).text(`PKR ${money(view.breakdown.net)}`, 300, y + 14, { width: 220, align: 'right' });

    doc.end();
  });
}
