const UnifiedReceiptTemplate = (receiptData) => {
  const {
    receiptType,
    receiptNumber,
    institutionDetails,
    studentDetails,
    paymentDetails,
    feeBreakdown,
    paymentSummary,
    subjects,
    academicYear,
    collegeSealBase64,
    agnelLogoBase64,
    copyLabel,
  } = receiptData;

  const formatDateForReceipt = (dateString) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.error("Invalid date string provided:", dateString);
      return dateString;
    }
    const options = {
      day: "2-digit",
      month: "short",
      year: "numeric",
    };
    const formatter = new Intl.DateTimeFormat("en-GB", options);
    return formatter.format(date).replace(/ /g, "-");
  };

  const convertAmountToWords = (amount) => {
    if (!amount || amount === 0) return "Zero";

    const units = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
    ];
    const teens = [
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];
    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];

    const convertBelowThousand = (num) => {
      if (num === 0) return "";
      if (num < 10) return units[num];
      if (num < 20) return teens[num - 10];
      if (num < 100)
        return (
          tens[Math.floor(num / 10)] +
          (num % 10 !== 0 ? " " + units[num % 10] : "")
        );
      return (
        units[Math.floor(num / 100)] +
        " Hundred" +
        (num % 100 !== 0 ? " " + convertBelowThousand(num % 100) : "")
      );
    };

    const roundedAmount = Math.floor(amount);
    if (roundedAmount < 1000) return convertBelowThousand(roundedAmount);
    if (roundedAmount < 100000) {
      const thousands = Math.floor(roundedAmount / 1000);
      const remainder = roundedAmount % 1000;
      return (
        convertBelowThousand(thousands) +
        " Thousand" +
        (remainder !== 0 ? " " + convertBelowThousand(remainder) : "")
      );
    }
    if (roundedAmount < 10000000) {
      const lakhs = Math.floor(roundedAmount / 100000);
      let remainder = roundedAmount % 100000;
      let result = convertBelowThousand(lakhs) + " Lakh";
      if (remainder >= 1000) {
        result +=
          " " +
          convertBelowThousand(Math.floor(remainder / 1000)) +
          " Thousand";
        remainder = remainder % 1000;
      }
      if (remainder !== 0) {
        result += " " + convertBelowThousand(remainder);
      }
      return result;
    }
    return "Amount Too Large";
  };

  const getReceiptTypeLabel = (type) => {
    if (copyLabel) return copyLabel;
    switch (type) {
      case "student_fee":
        return "Student Copy";
      case "atkt":
        return "Institute Copy";
      case "application":
        return "Institute Copy";
      default:
        return "RECEIPT";
    }
  };

  const receiptTypeLabel = getReceiptTypeLabel(receiptType);
  const amountPaid = paymentSummary?.amountPaid || 0;
  const amountInWords = convertAmountToWords(amountPaid);
  const paymentDate = paymentDetails?.paymentDate
    ? new Date(paymentDetails.paymentDate)
    : new Date();

  const getPaymentItems = () => {
    const items = [];

    if (receiptType === "student_fee") {
      const isInstallment = paymentSummary?.isFullPayment === false;

      if (isInstallment) {
        const installmentLabel = paymentSummary?.installmentNumber
          ? ` (Installment ${paymentSummary.installmentNumber})`
          : "";
        items.push({
          particulars: `Tuition Fees${installmentLabel}`,
          amount: amountPaid,
        });
        items.push({
          particulars: "Development Fees",
          amount: 0,
        });
        if (feeBreakdown?.latePaymentPenalty) {
          items.push({
            particulars: "Late Payment Penalty",
            amount: feeBreakdown.latePaymentPenalty,
          });
        }
      } else {
        if (feeBreakdown?.tuitionFee)
          items.push({
            particulars: "Tuition Fees",
            amount: feeBreakdown.tuitionFee,
          });
        if (feeBreakdown?.developmentFee)
          items.push({
            particulars: "Development Fees",
            amount: feeBreakdown.developmentFee,
          });
        if (feeBreakdown?.latePaymentPenalty)
          items.push({
            particulars: "Late Payment Penalty",
            amount: feeBreakdown.latePaymentPenalty,
          });
      }
    } else if (receiptType === "application") {
      const isInstallment = paymentSummary?.isFullPayment === false;

      if (isInstallment) {
        const installmentLabel = paymentSummary?.installmentNumber
          ? ` (Installment ${paymentSummary.installmentNumber})`
          : "";
        items.push({
          particulars: `Tuition fee${installmentLabel}`,
          amount: amountPaid,
        });
        items.push({
          particulars: "Development Fee",
          amount: 0,
        });
      } else {
        const appFee = feeBreakdown?.applicationFee || 0;
        const devFee = feeBreakdown?.developmentFee || 0;
        const netAppFee = appFee - devFee;

        items.push({
          particulars: "Tuition fee",
          amount: netAppFee,
        });
        items.push({
          particulars: "Development Fee",
          amount: devFee,
        });
      }
    } else if (receiptType === "atkt") {
      items.push({
        particulars: "Examination Fee",
        amount: feeBreakdown?.examinationFee || amountPaid,
      });
    }

    return items.length > 0
      ? items
      : [{ particulars: "Fee Payment", amount: amountPaid }];
  };

  const paymentItems = getPaymentItems();

  const agnelLogoSrc = agnelLogoBase64 || "/AgnelLogo.png";
  const sealImageSrc = collegeSealBase64 || "/uploads/images/clg_seal.png";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Receipt - ${receiptNumber}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @media print {
            body { margin: 0; padding: 0; }
        }
        .receipt-container { 
            font-family: Arial, sans-serif;
            max-width: 100%;
            margin: 0;
            padding: 0;
            font-size: 12px;
        }
        .header-text-sm { font-size: 10px; }
        .header-text-base { font-size: 11px; }
        .header-text-lg { font-size: 13px; }
        .header-text-xl { font-size: 16px; }
        .header-text-2xl { font-size: 18px; }
        .body-text-sm { font-size: 10px; }
        .body-text-base { font-size: 11px; }
        .body-text-lg { font-size: 12px; }
        .table-text { font-size: 10px; }
        img { max-width: 100%; height: auto; }
        .logo-img { width: 120px; height: auto; }
        .seal-img { width: 100px; height: auto; }
    </style>
</head>
<body>
    <section class="w-full h-full receipt-container">
        <div>
            <div class="flex flex-col md:flex-row pt-4 px-4 md:px-8">
                <div class="pl-0 md:pl-2 flex justify-center">
                    <img src="${agnelLogoSrc}" 
                         alt="agnelLogo" 
                         class="logo-img" />
                </div>

                <div class="relative text-center w-full py-3 sm:py-2 md:pr-24 xl:pr-32">
                    <p class="header-text-sm font-semibold">Agnel Charities</p>
                    <p class="font-bold header-text-2xl text-[#ffcc28] leading-6">
                        ${institutionDetails?.name || "AGNEL SCHOOL OF LAW"}
                    </p>
                    <p class="header-text-sm font-normal">
                        Affiliated to University of Mumbai & Approved by Bar Council of India
                    </p>
                    <p class="header-text-sm font-semibold">
                        ACCREDITTED 'B++' Grade by NAAC, ISO 9001:2015
                    </p>
                    <p class="header-text-base font-light tracking-normal">
                        ${institutionDetails?.address || "Sector 9A, Vashi, Navi Mumbai Maharashtra 400703"}
                        | ${institutionDetails?.email || "asl@agnelschooloflaw.com"}
                        | ${institutionDetails?.website || "https://agnelschooloflaw.com"}
                        | Tel.: ${institutionDetails?.phone || "02227771000"}
                    </p>
                    <p class="absolute hidden sm:flex top-0 sm:right-0 lg:right-16 xl:right-40 body-text-base font-bold p-2">
                        ${receiptTypeLabel}
                    </p>
                </div>

                <p class="flex justify-center sm:hidden header-text-lg font-bold p-1 text-center">
                    ${receiptTypeLabel}
                </p>
            </div>
        </div>

        <h3 class="text-center font-bold pb-1 body-text-base">Payment Receipt</h3>
        <div class="border-[2px] border-[#ffcc28]"></div>

        <div class="px-4 sm:px-6">
            <div class="flex flex-col sm:flex-row sm:gap-x-2 mt-4 justify-between body-text-base font-bold px-6">
                <div>
                    ${academicYear ? `<p>Academic Year : ${academicYear}</p>` : ""}
                    <p>Received From : ${studentDetails?.name?.toUpperCase() || "N/A"}</p>
                    <p>Receipt No : ${receiptNumber || "N/A"}</p>
                    <p>Payment Date : ${formatDateForReceipt(paymentDate)}</p>
                </div>
                <div>
                    ${studentDetails?.batch ? `<p>Class : ${studentDetails.batch}</p>` : ""}
                    ${studentDetails?.program && !studentDetails?.batch ? `<p>Course : ${studentDetails.program}</p>` : ""}
                    ${studentDetails?.rollNumber ? `<p>Roll Number : ${studentDetails.rollNumber}</p>` : ""}
                    ${studentDetails?.id && studentDetails.id !== studentDetails?.rollNumber ? `<p>${studentDetails.idLabel || "ID"} : ${studentDetails.id}</p>` : ""}
                    ${paymentDetails?.transactionId ? `<p>Transaction ID: ${paymentDetails.transactionId}</p>` : ""}
                </div>
                <div>
                    <p>Date : ${formatDateForReceipt(paymentDate)}</p>
                    <p>Payment : ${paymentDetails?.paymentMode || "Online"}</p>
                    ${paymentDetails?.orderId ? `<p>Order ID : ${paymentDetails.orderId}</p>` : ""}
                </div>
            </div>

            <div class="border border-black mx-6 my-3"></div>

            ${
              subjects && subjects.length > 0
                ? `
            <div class="mx-6 mb-4">
                <h4 class="font-bold body-text-base mb-2">Subjects:</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-1">
                    ${subjects
                      .map(
                        (subject, index) => `
                    <div class="body-text-sm">
                        ${index + 1}. ${subject.label || subject.name}
                        ${subject.code ? ` (${subject.code})` : ""}
                    </div>
                    `,
                      )
                      .join("")}
                </div>
                <div class="border border-black my-3"></div>
            </div>
            `
                : ""
            }

            <div class="${paymentItems.length === 1 ? "mx-6" : "grid grid-cols-1 md:grid-cols-2 mx-6"} mt-8">
                ${paymentItems
                  .map(
                    (item, index) => `
                <table class="pt-6 table-text overflow-hidden ${paymentItems.length === 1 ? "w-full" : ""}">
                    <thead>
                        <tr class="text-black border-b border-black">
                            <th class="px-3 py-1 text-left font-bold w-1/12">SR</th>
                            <th class="px-3 py-1 text-left font-bold w-6/12">Particulars</th>
                            <th class="px-3 py-1 text-right font-bold w-5/12">Amount (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="border-b border-black">
                            <td class="px-3 py-1">${index + 1}</td>
                            <td class="px-3 py-1 font-medium text-gray-700">${item.particulars}</td>
                            <td class="px-3 py-1 text-right font-mono">${item.amount.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
                `,
                  )
                  .join("")}
            </div>

            <div class="relative flex flex-wrap mx-6 border-b border-black py-1 font-bold body-text-base mt-4">
                <p class="w-2/4 text-left">
                    Total Rs. ₹${amountPaid.toFixed(2)}
                    ${receiptType === "student_fee" && paymentSummary?.isFullPayment === false ? '<span class="text-xs ml-2">(Partially Paid)</span>' : ""}
                </p>
                <p class="w-2/4 text-right pr-8">Authorised Signature</p>
                <img class="absolute top-12 sm:top-6 right-8 seal-img"
                     src="${sealImageSrc}"
                     alt="college_seal" />
            </div>
            
            <p class="w-full lg:w-3/4 mx-6 leading-tight my-2 body-text-sm">
                Received sum of Rupees in words: <strong>${amountInWords} Only</strong>
                <br />
                <span class="text-xs italic">
                    This is a computer-generated digital fee receipt; no signature is required.
                </span>
            </p>
        </div>
    </section>
</body>
</html>
    `;
};

export default UnifiedReceiptTemplate;
