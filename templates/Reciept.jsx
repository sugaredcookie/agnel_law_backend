import React from "react";

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
    const remainder = roundedAmount % 100000;
    let result = convertBelowThousand(lakhs) + " Lakh";
    if (remainder >= 1000) {
      result +=
        " " + convertBelowThousand(Math.floor(remainder / 1000)) + " Thousand";
      remainder = remainder % 1000;
    }
    if (remainder !== 0) {
      result += " " + convertBelowThousand(remainder);
    }
    return result;
  }
  return "Amount Too Large";
};

const getReceiptTypeLabel = (receiptType) => {
  switch (receiptType) {
    case "student_fee":
      return "STUDENT COPY";
    case "atkt":
      return "ATKT FEE RECEIPT";
    case "application":
      return "APPLICATION FEE RECEIPT";
    default:
      return "RECEIPT";
  }
};

const Reciept = ({ receiptData }) => {
  if (!receiptData) {
    return <div>No receipt data available</div>;
  }

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
  } = receiptData;

  const receiptTypeLabel = getReceiptTypeLabel(receiptType);
  const amountPaid = paymentSummary?.amountPaid || 0;
  const amountInWords = convertAmountToWords(amountPaid);
  const paymentDate = paymentDetails?.paymentDate
    ? new Date(paymentDetails.paymentDate)
    : new Date();

  const getPaymentItems = () => {
    const items = [];

    if (receiptType === "student_fee") {
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
    } else if (receiptType === "application") {
      items.push({
        particulars: "Application Fee",
        amount: feeBreakdown?.applicationFee || amountPaid,
      });
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

  return (
    <section className="w-full h-full ">
      <div>
        <div className="flex flex-col  md:flex-row  pt-8  px-4 md:px-12">
          <div className="pl-0 md:pl-4 flex justify-center ">
            <img
              src="/AgnelLogo.png"
              alt="agnelLogo"
              width={180}
              height={150}
              className="w-1/4 sm:w-[40%] md:w-[180px]"
            />
          </div>

          <div className="relative text-center w-full py-6 sm:py-2 md:pr-36 xl:pr-48">
            <p className="text-sm font-semibold">Agnel Charities</p>
            <p className="font-bold text-2xl text-[#ffcc28] leading-8">
              {institutionDetails?.name || "AGNEL SCHOOL OF LAW"}
            </p>
            <p className="text-sm font-normal">
              Affiliated to University of Mumbai & Approved by Bar Council of
              India
            </p>
            <p className="text-sm font-semibold">
              ACCREDITTED 'B++' Grade by NAAC, ISO 9001:2015
            </p>
            <p className="text-base font-light tracking-normal ">
              {institutionDetails?.address ||
                "Sector 9A, Vashi, Navi Mumbai Maharashtra 400703"}
              {" | "}
              {institutionDetails?.email || "asl@agnelschooloflaw.com"}
              {" | "}
              {institutionDetails?.website || "https://agnelschooloflaw.com"}
              {" | Tel.: "}
              {institutionDetails?.phone || "02227771000"}
            </p>
            <p className="absolute hidden sm:flex -top-3 sm:right-0 lg:right-20 xl:right-60 text-base font-bold p-4">
              {receiptTypeLabel}
            </p>
          </div>

          <p className="flex justify-center sm:hidden text-xl font-bold p-1 text-center">
            {receiptTypeLabel}
          </p>
        </div>
      </div>

      <h3 className="text-center font-bold pb-1">Payment Receipt</h3>
      <div className="border-[3px] border-[#ffcc28]" />

      <div className="px-4 sm:px-8">
        <div className="flex flex-col sm:flex-row sm:gap-x-2 mt-8 justify-between text-lg font-bold px-8">
          <div>
            {academicYear && <p>Academic Year : {academicYear}</p>}
            <p>
              Received From : {studentDetails?.name?.toUpperCase() || "N/A"}
            </p>
            <p>Receipt No : {receiptNumber || "N/A"}</p>
            <p>Payment Date : {formatDateForReceipt(paymentDate)}</p>
          </div>
          <div>
            {studentDetails?.batch && <p>Class : [{studentDetails.batch}]</p>}
            {studentDetails?.program && !studentDetails?.batch && (
              <p>Course : {studentDetails.program}</p>
            )}
            {studentDetails?.rollNumber && (
              <p>Roll Number : {studentDetails.rollNumber}</p>
            )}
            {studentDetails?.id && (
              <p>
                {studentDetails.idLabel || "ID"} : {studentDetails.id}
              </p>
            )}
            {paymentDetails?.transactionId && (
              <p>Transaction ID: {paymentDetails.transactionId}</p>
            )}
          </div>
          <div>
            <p>Date : {formatDateForReceipt(paymentDate)}</p>
            <p>Payment : {paymentDetails?.paymentMode || "Online"}</p>
            {paymentDetails?.orderId && (
              <p>Order ID : {paymentDetails.orderId}</p>
            )}
          </div>
        </div>

        <div className="border border-black mx-8 my-6" />

        {subjects && subjects.length > 0 && (
          <div className="mx-8 mb-6">
            <h4 className="font-bold text-lg mb-3">Subjects:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {subjects.map((subject, index) => (
                <div key={index} className="text-base">
                  {index + 1}. {subject.label || subject.name}
                  {subject.code && ` (${subject.code})`}
                </div>
              ))}
            </div>
            <div className="border border-black my-6" />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 mx-8 mt-16">
          {paymentItems.map((item, index) => (
            <table key={index} className="pt-12 text-sm overflow-hidden">
              <thead>
                <tr className="text-black border-b border-black text-lg">
                  <th className="px-4 py-2 text-left font-bold w-1/12">SR</th>
                  <th className="px-4 py-2 text-left font-bold w-6/12">
                    Particulars
                  </th>
                  <th className="px-4 py-2 text-right font-bold w-5/12">
                    Amount (₹)
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-black text-lg">
                  <td className="px-4 py-2">{index + 1}</td>
                  <td className="px-4 py-2 font-medium text-gray-700">
                    {item.particulars}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {item.amount.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          ))}
        </div>

        <div className="relative flex flex-wrap mx-8 border-b border-black py-1 font-bold text-lg mt-8">
          <p className="w-2/4 text-left">Total Rs. ₹{amountPaid.toFixed(2)}</p>
          <p className="w-2/4 text-left">Authorised Signature</p>
          <img
            className="absolute top-20 sm:top-10 right-0 sm:right-1/3 md:right-2/6 xl:right-[38%]"
            src="/uploads/images/clg_seal.png"
            alt="college_seal"
            width={150}
            height={150}
          />
        </div>

        <p className="w-full lg:w-3/4 mx-8 leading-5 my-2 text-base">
          Received sum of Rupees in words: <strong>{amountInWords} Only</strong>
          <br />
          <span className="text-sm italic">
            This is a computer-generated digital fee receipt; no signature is
            required.
          </span>
        </p>
      </div>
    </section>
  );
};

export default Reciept;
