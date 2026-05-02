const ReceiptTemplate = (receiptData) => {
  const {
    receiptType,
    receiptNumber,
    institutionDetails,
    studentDetails,
    paymentDetails,
    feeBreakdown,
    paymentSummary,
    subjects,
    collegeSealBase64,
    agnelLogoBase64,
    naacLogoBase64,
  } = receiptData;

  const formatDate = (date) => {
    if (!date) return "N/A";
    const d = new Date(date);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return "0.00";
    return parseFloat(amount).toFixed(2);
  };

  const getReceiptTitle = () => {
    switch (receiptType) {
      case "student_fee":
        return "FEE PAYMENT RECEIPT";
      case "application":
        return "APPLICATION FEE RECEIPT";
      case "atkt":
        return "ATKT EXAMINATION FEE RECEIPT";
      default:
        return "PAYMENT RECEIPT";
    }
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${getReceiptTitle()} - ${receiptNumber}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Roboto', Arial, sans-serif;
            background: white;
            color: #000;
            line-height: 1.4;
        }
        .receipt-container {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 15mm;
            background: white;
            position: relative;
        }
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #1e40af;
            padding-bottom: 10px;
            margin-bottom: 12px;
        }
        .logo {
            width: 60px;
            height: 60px;
            object-fit: contain;
        }
        .header-content {
            flex: 1;
            text-align: center;
            padding: 0 15px;
        }
        .institution-name {
            font-size: 20px;
            font-weight: 700;
            color: #1e40af;
            margin-bottom: 3px;
            text-transform: uppercase;
        }
        .institution-subtitle {
            font-size: 9px;
            color: #4b5563;
            margin-bottom: 2px;
        }
        .institution-address {
            font-size: 8px;
            color: #6b7280;
            line-height: 1.2;
        }
        .receipt-title-box {
            background: #1e40af;
            color: white;
            text-align: center;
            padding: 8px;
            margin: 10px 0;
            font-size: 16px;
            font-weight: 700;
            letter-spacing: 0.5px;
        }
        .receipt-meta {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            padding: 8px;
            background: #f3f4f6;
            border-radius: 4px;
        }
        .receipt-meta-item {
            font-size: 10px;
        }
        .receipt-meta-label {
            color: #6b7280;
            font-weight: 500;
        }
        .receipt-meta-value {
            font-weight: 600;
            color: #000;
        }
        .section {
            margin-bottom: 15px;
        }
        .section-title {
            font-size: 12px;
            font-weight: 700;
            color: #1e40af;
            margin-bottom: 8px;
            padding-bottom: 3px;
            border-bottom: 1px solid #e5e7eb;
        }
        .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .detail-item {
            font-size: 10px;
            padding: 3px 0;
        }
        .detail-label {
            color: #6b7280;
            font-weight: 500;
        }
        .detail-value {
            font-weight: 600;
            color: #000;
            margin-top: 1px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        th {
            background: #f3f4f6;
            padding: 10px;
            text-align: left;
            font-size: 12px;
            font-weight: 600;
            border: 1px solid #d1d5db;
        }
        td {
            padding: 8px 10px;
            font-size: 12px;
            border: 1px solid #d1d5db;
        }
        .text-right {
            text-align: right;
        }
        .total-row {
            background: #f9fafb;
            font-weight: 700;
        }
        .amount-highlight {
            color: #059669;
            font-weight: 700;
            font-size: 14px;
        }
        .footer {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 2px solid #e5e7eb;
        }
        .seal-container {
            text-align: center;
            margin-top: 20px;
        }
        .seal-image {
            width: 80px;
            height: 80px;
            margin-bottom: 5px;
        }
        .note {
            font-size: 9px;
            color: #6b7280;
            padding: 8px;
            background: #f9fafb;
            border-left: 3px solid #1e40af;
            margin-bottom: 15px;
        }
        .watermark {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 100px;
            color: rgba(30, 64, 175, 0.05);
            font-weight: 700;
            z-index: 0;
            pointer-events: none;
        }
        .content {
            position: relative;
            z-index: 1;
        }
        @media print {
            body {
                margin: 0;
                padding: 0;
            }
            .receipt-container {
                margin: 0;
                padding: 15mm;
            }
            .watermark {
                display: block;
            }
        }
    </style>
</head>
<body>
    <div class="receipt-container">
        <div class="watermark">PAID</div>
        <div class="content">
            <!-- Header -->
            <div class="header">
                ${agnelLogoBase64 ? `<img src="${agnelLogoBase64}" alt="Institution Logo" class="logo">` : '<div style="width: 80px;"></div>'}
                <div class="header-content">
                    <div class="institution-name">${institutionDetails.name || "AGNEL SCHOOL OF LAW"}</div>
                    <div class="institution-subtitle">AGNEL CHARITIES</div>
                    <div class="institution-subtitle">Affiliated to University of Mumbai & Approved by Bar Council of India</div>
                    <div class="institution-subtitle" style="font-weight: 600;">ACCREDITTED 'B++' Grade by NAAC, ISO 9001:2015</div>
                    <div class="institution-address">
                        ${institutionDetails.address || "Sector 9A, Vashi, Navi Mumbai, Maharashtra 400703"}<br>
                        Phone: ${institutionDetails.phone || "02227771000"} | Email: ${institutionDetails.email || "asl.office2023@gmail.com"}<br>
                        Website: ${institutionDetails.website || "www.agnelschooloflaw.com"}
                    </div>
                </div>
                <div class="seal-container">
                    ${collegeSealBase64 ? `<img src="${collegeSealBase64}" alt="College Seal" class="seal-image">` : ""}
                    <div style="font-size: 10px; font-weight: 600; text-align: center;">Authorized Seal</div>
                </div>
            </div>

            <!-- Receipt Title -->
            <div class="receipt-title-box">${getReceiptTitle()}</div>

            <!-- Receipt Meta Info -->
            <div class="receipt-meta">
                <div class="receipt-meta-item">
                    <span class="receipt-meta-label">Receipt No:</span>
                    <span class="receipt-meta-value">${receiptNumber}</span>
                </div>
                <div class="receipt-meta-item">
                    <span class="receipt-meta-label">Date:</span>
                    <span class="receipt-meta-value">${formatDate(paymentDetails.paymentDate)}</span>
                </div>
                <div class="receipt-meta-item">
                    <span class="receipt-meta-label">Payment Mode:</span>
                    <span class="receipt-meta-value">${paymentDetails.paymentMode || "Online"}</span>
                </div>
            </div>

            <!-- Student Details -->
            <div class="section">
                <div class="section-title">Student/Applicant Details</div>
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">Name</div>
                        <div class="detail-value">${studentDetails.name}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">${studentDetails.idLabel || "Student ID"}</div>
                        <div class="detail-value">${studentDetails.id}</div>
                    </div>
                    ${
                      studentDetails.program
                        ? `
                    <div class="detail-item">
                        <div class="detail-label">Program</div>
                        <div class="detail-value">${studentDetails.program}</div>
                    </div>
                    `
                        : ""
                    }
                    ${
                      studentDetails.batch
                        ? `
                    <div class="detail-item">
                        <div class="detail-label">Batch</div>
                        <div class="detail-value">${studentDetails.batch}</div>
                    </div>
                    `
                        : ""
                    }
                    ${
                      studentDetails.email
                        ? `
                    <div class="detail-item">
                        <div class="detail-label">Email</div>
                        <div class="detail-value">${studentDetails.email}</div>
                    </div>
                    `
                        : ""
                    }
                    ${
                      studentDetails.mobile
                        ? `
                    <div class="detail-item">
                        <div class="detail-label">Mobile</div>
                        <div class="detail-value">${studentDetails.mobile}</div>
                    </div>
                    `
                        : ""
                    }
                </div>
            </div>

            <!-- Payment Details -->
            <div class="section">
                <div class="section-title">Payment Details</div>
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">Transaction ID</div>
                        <div class="detail-value">${paymentDetails.transactionId}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Order ID</div>
                        <div class="detail-value">${paymentDetails.orderId || "N/A"}</div>
                    </div>
                    ${
                      paymentDetails.razorpayPaymentId
                        ? `
                    <div class="detail-item">
                        <div class="detail-label">Razorpay Payment ID</div>
                        <div class="detail-value">${paymentDetails.razorpayPaymentId}</div>
                    </div>
                    `
                        : ""
                    }
                    ${
                      paymentDetails.academicYear
                        ? `
                    <div class="detail-item">
                        <div class="detail-label">Academic Year</div>
                        <div class="detail-value">${paymentDetails.academicYear}</div>
                    </div>
                    `
                        : ""
                    }
                </div>
            </div>

            <!-- Fee Breakdown -->
            ${
              receiptType === "atkt" && subjects && subjects.length > 0
                ? `
            <div class="section">
                <div class="section-title">ATKT Subjects</div>
                <table>
                    <thead>
                        <tr>
                            <th>S.No</th>
                            <th>Subject Name</th>
                            <th>Subject Code</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${subjects
                          .map(
                            (subject, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${subject.label || subject.name}</td>
                            <td>${subject.code || subject.id || "-"}</td>
                        </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
            `
                : ""
            }

            ${
              feeBreakdown && Object.keys(feeBreakdown).length > 0
                ? `
            <div class="section">
                <div class="section-title">Fee Breakdown</div>
                <table>
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th class="text-right">Amount (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                          feeBreakdown.tuitionFee
                            ? `
                        <tr>
                            <td>Tuition Fee</td>
                            <td class="text-right">${formatCurrency(feeBreakdown.tuitionFee)}</td>
                        </tr>
                        `
                            : ""
                        }
                        ${
                          feeBreakdown.developmentFee
                            ? `
                        <tr>
                            <td>Development Fee</td>
                            <td class="text-right">${formatCurrency(feeBreakdown.developmentFee)}</td>
                        </tr>
                        `
                            : ""
                        }
                        ${
                          feeBreakdown.applicationFee
                            ? `
                        <tr>
                            <td>Application Fee</td>
                            <td class="text-right">${formatCurrency(feeBreakdown.applicationFee)}</td>
                        </tr>
                        `
                            : ""
                        }
                        ${
                          feeBreakdown.examinationFee
                            ? `
                        <tr>
                            <td>Examination Fee</td>
                            <td class="text-right">${formatCurrency(feeBreakdown.examinationFee)}</td>
                        </tr>
                        `
                            : ""
                        }
                        ${
                          feeBreakdown.latePaymentPenalty &&
                          feeBreakdown.latePaymentPenalty > 0
                            ? `
                        <tr>
                            <td>Late Payment Penalty</td>
                            <td class="text-right">${formatCurrency(feeBreakdown.latePaymentPenalty)}</td>
                        </tr>
                        `
                            : ""
                        }
                        <tr class="total-row">
                            <td><strong>Total Amount Paid</strong></td>
                            <td class="text-right amount-highlight">₹ ${formatCurrency(paymentSummary.amountPaid)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            `
                : ""
            }

            <!-- Payment Summary -->
            <div class="section">
                <div class="section-title">Payment Summary</div>
                <div class="details-grid">
                    ${
                      paymentSummary.totalFeeAmount
                        ? `
                    <div class="detail-item">
                        <div class="detail-label">Total Fee Amount</div>
                        <div class="detail-value">₹ ${formatCurrency(paymentSummary.totalFeeAmount)}</div>
                    </div>
                    `
                        : ""
                    }
                    <div class="detail-item">
                        <div class="detail-label">Amount Paid</div>
                        <div class="detail-value amount-highlight">₹ ${formatCurrency(paymentSummary.amountPaid)}</div>
                    </div>
                    ${
                      paymentSummary.installmentNumber
                        ? `
                    <div class="detail-item">
                        <div class="detail-label">Installment Number</div>
                        <div class="detail-value">${paymentSummary.installmentNumber}</div>
                    </div>
                    `
                        : ""
                    }
                    <div class="detail-item">
                        <div class="detail-label">Payment Type</div>
                        <div class="detail-value">${paymentSummary.isFullPayment ? "Full Payment" : "Installment Payment"}</div>
                    </div>
                    ${
                      paymentSummary.remainingBalance !== undefined &&
                      paymentSummary.remainingBalance > 0
                        ? `
                    <div class="detail-item">
                        <div class="detail-label">Remaining Balance</div>
                        <div class="detail-value">₹ ${formatCurrency(paymentSummary.remainingBalance)}</div>
                    </div>
                    `
                        : ""
                    }
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
            </div>

            <div class="note">
                <strong>Note:</strong> This is a computer-generated receipt and does not require a physical signature. 
                For any queries or discrepancies, please contact the accounts department at ${institutionDetails.email || "asl.office2023@gmail.com"}.
                ${receiptType === "atkt" ? " For examination-related queries, contact the examination cell." : ""}
            </div>
        </div>
    </div>
</body>
</html>
`;
};

export default ReceiptTemplate;
