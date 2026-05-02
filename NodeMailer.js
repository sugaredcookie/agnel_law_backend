import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const config = {
  service: "gmail",
  host: process.env.SMTP_HOST,

  auth: {
    user: process.env.SMTP_EMAIL_USER,
    pass: process.env.SMTP_EMAIL_PASS,
  },
};

export const transporter = nodemailer.createTransport(config);

export const newUserStudentRegisterEmailWithLoginDetails = (
  name,
  email,
  password,
  date,
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New User/Student Registration</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        .header {
            background-color: #0F172A;
            color: #ffffff;
            padding: 10px 0;
            text-align: center;
        }
        .header h1 {
            margin: 0;
        }
        .content {
            padding: 20px;
        }
        .content p {
            font-size: 16px;
            line-height: 1.5;
        }
        .footer {
            text-align: center;
            padding: 10px 0;
            background-color: #f4f4f4;
            font-size: 12px;
            color: #666666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>New User/Student Registration</h1>
        </div>
        <div class="content">
            <p>Dear ${name},</p>
            <p>you have successfully registered with us, below are your login details, please login.</p>
            <p><strong>User Details:</strong></p>
            <ul>
                <li><strong>Name:</strong> ${name}</li>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Password:</strong> ${password}</li>
                <li><strong>Registration Date:</strong> ${date}</li>
            </ul>
            <p>Best regards,</p>
            <p>${process.env.SMTP_COMPANY}</p>
        </div>
        <div class="footer">
            &copy; 2025 ${process.env.SMTP_COMPANY}. All rights reserved.
        </div>
    </div>
</body>
</html>
`;

export const newUserStudentPasswordEmailWithLoginDetails = (
  name,
  email,
  password,
  date,
) => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New User/Student Password</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
          }
          .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              padding: 20px;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          }
          .header {
              background-color: #0F172A;
              color: #ffffff;
              padding: 10px 0;
              text-align: center;
          }
          .header h1 {
              margin: 0;
          }
          .content {
              padding: 20px;
          }
          .content p {
              font-size: 16px;
              line-height: 1.5;
          }
          .footer {
              text-align: center;
              padding: 10px 0;
              background-color: #f4f4f4;
              font-size: 12px;
              color: #666666;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">
              <h1>New User/Student Password</h1>
          </div>
          <div class="content">
              <p>Dear ${name},</p>
              <p>you have successfully reset your password with us, below is your new login details, please login.</p>
              <p><strong>User Details:</strong></p>
              <ul>
                  <li><strong>Name:</strong> ${name}</li>
                  <li><strong>Email:</strong> ${email}</li>
                  <li><strong>New Password:</strong> ${password}</li>
                  <li><strong>Registration Date:</strong> ${date}</li>
              </ul>
              <p>Best regards,</p>
              <p>${process.env.SMTP_COMPANY}</p>
          </div>
          <div class="footer">
              &copy; 2025 ${process.env.SMTP_COMPANY}. All rights reserved.
          </div>
      </div>
  </body>
  </html>
  `;

export const newUserFacultyRegisterEmailWithLoginDetails = (
  name,
  email,
  password,
  date,
) => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Faculty Registration</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
          }
          .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              padding: 20px;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          }
          .header {
              background-color: #0F172A;
              color: #ffffff;
              padding: 10px 0;
              text-align: center;
          }
          .header h1 {
              margin: 0;
          }
          .content {
              padding: 20px;
          }
          .content p {
              font-size: 16px;
              line-height: 1.5;
          }
          .footer {
              text-align: center;
              padding: 10px 0;
              background-color: #f4f4f4;
              font-size: 12px;
              color: #666666;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">
              <h1>New Faculty Registration</h1>
          </div>
          <div class="content">
              <p>Dear ${name},</p>
              <p>you have successfully registered with us, below are your login details, please login.</p>
              <p><strong>User Details:</strong></p>
              <ul>
                  <li><strong>Name:</strong> ${name}</li>
                  <li><strong>Email:</strong> ${email}</li>
                  <li><strong>Password:</strong> ${password}</li>
                  <li><strong>Registration Date:</strong> ${date}</li>
              </ul>
              <p>Best regards,</p>
              <p>${process.env.SMTP_COMPANY}</p>
          </div>
          <div class="footer">
              &copy; 2025 ${process.env.SMTP_COMPANY}. All rights reserved.
          </div>
      </div>
  </body>
  </html>
  `;

export const notificationEmail = (message) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Notification</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                padding: 0;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 20px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            }
            .header {
                background-color: #0F172A;
                color: #ffffff;
                padding: 10px 0;
                text-align: center;
            }
            .header h1 {
                margin: 0;
            }
            .content {
                padding: 20px;
            }
            .content p {
                font-size: 16px;
                line-height: 1.5;
            }
            .footer {
                text-align: center;
                padding: 10px 0;
                background-color: #f4f4f4;
                font-size: 12px;
                color: #666666;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="content">
                <p>${message}</p>
                <p>Best regards,</p>
                <p>${process.env.SMTP_COMPANY}</p>
            </div>
            <div class="footer">
                &copy; 2025 ${process.env.SMTP_COMPANY}. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    `;

export const birthdayWishesEmail = (name, date) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Happy Birthday, ${name}! 🎉🎂</h2>
      <p>We hope your special day is filled with joy, laughter, and wonderful moments!</p>
      <p>Best wishes from the entire team at ${process.env.SMTP_COMPANY}.</p>
      <p style="color: #666; font-size: 12px; margin-top: 20px;">Sent on: ${date}</p>
    </div>
  `;
};

const currentDate = new Date();

const year = currentDate.getFullYear();
const month = String(currentDate.getMonth() + 1).padStart(2, "0");
const day = String(currentDate.getDate()).padStart(2, "0");
const hours = String(currentDate.getHours()).padStart(2, "0");
const minutes = String(currentDate.getMinutes()).padStart(2, "0");
const seconds = String(currentDate.getSeconds()).padStart(2, "0");

export const formattedDate = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;

export const paymentReminderUpcoming = (
  studentName,
  applicationNumber,
  installmentNumber,
  amount,
  dueDate,
  paymentLink,
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Reminder - Due Soon</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        .header {
            background-color: #0F172A;
            color: #ffffff;
            padding: 20px 0;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .content {
            padding: 30px 20px;
        }
        .content p {
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 15px;
        }
        .payment-details {
            background-color: #f8f9fa;
            border-left: 4px solid #007bff;
            padding: 20px;
            margin: 20px 0;
        }
        .payment-details h3 {
            margin-top: 0;
            color: #333;
        }
        .payment-button {
            text-align: center;
            margin: 30px 0;
        }
        .payment-button a {
            background-color: #007bff;
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: bold;
        }
        .payment-button a:hover {
            background-color: #0056b3;
        }
        .footer {
            text-align: center;
            padding: 10px 0;
            background-color: #f4f4f4;
            font-size: 12px;
            color: #666666;
        }
        .urgent {
            color: #ff6b35;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💰 Payment Reminder</h1>
        </div>
        <div class="content">
            <p>Dear ${studentName},</p>
            <p>This is a friendly reminder that your payment is <span class="urgent">due soon</span>.</p>
            
            <div class="payment-details">
                <h3>Payment Details</h3>
                <ul>
                    <li><strong>Application Number:</strong> ${applicationNumber}</li>
                    <li><strong>Installment:</strong> ${installmentNumber}</li>
                    <li><strong>Amount Due:</strong> ₹${amount}</li>
                    <li><strong>Due Date:</strong> ${dueDate}</li>
                </ul>
            </div>

            <p>To avoid any inconvenience, please make your payment before the due date.</p>
            
            <div class="payment-button">
                <a href="${paymentLink}">Pay Now</a>
            </div>
            
            <p>If you have already made the payment, please ignore this reminder.</p>
            <p>For any queries, please contact our support team.</p>
            
            <p>Best regards,</p>
            <p><strong>${process.env.SMTP_COMPANY}</strong></p>
        </div>
        <div class="footer">
            &copy; 2025 ${process.env.SMTP_COMPANY}. All rights reserved.
        </div>
    </div>
</body>
</html>
`;

export const paymentReminderDueToday = (
  studentName,
  applicationNumber,
  installmentNumber,
  amount,
  paymentLink,
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Due Today</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        .header {
            background-color: #0F172A;
            color: #ffffff;
            padding: 20px 0;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .content {
            padding: 30px 20px;
        }
        .content p {
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 15px;
        }
        .payment-details {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 20px;
            margin: 20px 0;
        }
        .payment-details h3 {
            margin-top: 0;
            color: #856404;
        }
        .payment-button {
            text-align: center;
            margin: 30px 0;
        }
        .payment-button a {
            background-color: #ffc107;
            color: #212529;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: bold;
        }
        .payment-button a:hover {
            background-color: #e0a800;
        }
        .footer {
            text-align: center;
            padding: 10px 0;
            background-color: #f4f4f4;
            font-size: 12px;
            color: #666666;
        }
        .due-today {
            color: #ffc107;
            font-weight: bold;
            font-size: 18px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⏰ Payment Due Today</h1>
        </div>
        <div class="content">
            <p>Dear ${studentName},</p>
            <p class="due-today">Your payment is due TODAY!</p>
            <p>Please complete your payment as soon as possible to avoid any delays in processing.</p>
            
            <div class="payment-details">
                <h3>Payment Details</h3>
                <ul>
                    <li><strong>Application Number:</strong> ${applicationNumber}</li>
                    <li><strong>Installment:</strong> ${installmentNumber}</li>
                    <li><strong>Amount Due:</strong> ₹${amount}</li>
                    <li><strong>Status:</strong> <span style="color: #ffc107;">Due Today</span></li>
                </ul>
            </div>
            
            <div class="payment-button">
                <a href="${paymentLink}">Pay Now - Due Today</a>
            </div>
            
            <p>If you have already made the payment, please ignore this reminder.</p>
            <p>For immediate assistance, please contact our support team.</p>
            
            <p>Best regards,</p>
            <p><strong>${process.env.SMTP_COMPANY}</strong></p>
        </div>
        <div class="footer">
            &copy; 2025 ${process.env.SMTP_COMPANY}. All rights reserved.
        </div>
    </div>
</body>
</html>
`;

export const paymentReminderOverdue = (
  studentName,
  applicationNumber,
  installmentNumber,
  amount,
  daysPastDue,
  paymentLink,
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Urgent: Payment Overdue</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        .header {
            background-color: #0F172A;
            color: #ffffff;
            padding: 20px 0;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .content {
            padding: 30px 20px;
        }
        .content p {
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 15px;
        }
        .payment-details {
            background-color: #f8d7da;
            border-left: 4px solid #dc3545;
            padding: 20px;
            margin: 20px 0;
        }
        .payment-details h3 {
            margin-top: 0;
            color: #721c24;
        }
        .payment-button {
            text-align: center;
            margin: 30px 0;
        }
        .payment-button a {
            background-color: #dc3545;
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: bold;
        }
        .payment-button a:hover {
            background-color: #c82333;
        }
        .footer {
            text-align: center;
            padding: 10px 0;
            background-color: #f4f4f4;
            font-size: 12px;
            color: #666666;
        }
        .overdue {
            color: #dc3545;
            font-weight: bold;
            font-size: 18px;
        }
        .urgent-note {
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 Payment Overdue</h1>
        </div>
        <div class="content">
            <p>Dear ${studentName},</p>
            <p class="overdue">Your payment is ${daysPastDue} day${daysPastDue > 1 ? "s" : ""} overdue.</p>
            <p>We have not yet received your payment. Please complete your payment immediately to avoid any further delays.</p>
            
            <div class="payment-details">
                <h3>Overdue Payment Details</h3>
                <ul>
                    <li><strong>Application Number:</strong> ${applicationNumber}</li>
                    <li><strong>Installment:</strong> ${installmentNumber}</li>
                    <li><strong>Amount Due:</strong> ₹${amount}</li>
                    <li><strong>Status:</strong> <span style="color: #dc3545;">Overdue (${daysPastDue} day${daysPastDue > 1 ? "s" : ""})</span></li>
                </ul>
            </div>

            <div class="urgent-note">
                <p><strong>⚠️ Important Notice:</strong></p>
                <p>Continued delay in payment may affect your application processing. Please pay immediately to avoid any complications.</p>
            </div>
            
            <div class="payment-button">
                <a href="${paymentLink}">Pay Now - Urgent</a>
            </div>
            
            <p>If you have already made the payment, please contact us immediately with the payment details.</p>
            <p>For immediate assistance, please contact our support team or call us directly.</p>
            
            <p>Best regards,</p>
            <p><strong>${process.env.SMTP_COMPANY}</strong></p>
        </div>
        <div class="footer">
            &copy; 2025 ${process.env.SMTP_COMPANY}. All rights reserved.
        </div>
    </div>
</body>
</html>
`;

export const paymentConfirmationEmail = (
  studentName,
  applicationNumber,
  installmentNumber,
  amount,
  transactionId,
  nextInstallmentInfo = null,
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Confirmation</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        .header {
            background-color: #0F172A;
            color: #ffffff;
            padding: 20px 0;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .content {
            padding: 30px 20px;
        }
        .content p {
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 15px;
        }
        .payment-details {
            background-color: #d4edda;
            border-left: 4px solid #28a745;
            padding: 20px;
            margin: 20px 0;
        }
        .payment-details h3 {
            margin-top: 0;
            color: #155724;
        }
        .next-payment {
            background-color: #e2e3e5;
            border-left: 4px solid #6c757d;
            padding: 15px;
            margin: 20px 0;
        }
        .footer {
            text-align: center;
            padding: 10px 0;
            background-color: #f4f4f4;
            font-size: 12px;
            color: #666666;
        }
        .success {
            color: #28a745;
            font-weight: bold;
            font-size: 18px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Payment Confirmed</h1>
        </div>
        <div class="content">
            <p>Dear ${studentName},</p>
            <p class="success">Your payment has been successfully received!</p>
            <p>Thank you for your prompt payment. Here are the details of your transaction:</p>
            
            <div class="payment-details">
                <h3>Payment Details</h3>
                <ul>
                    <li><strong>Application Number:</strong> ${applicationNumber}</li>
                    <li><strong>Installment:</strong> ${installmentNumber}</li>
                    <li><strong>Amount Paid:</strong> ₹${amount}</li>
                    <li><strong>Transaction ID:</strong> ${transactionId}</li>
                    <li><strong>Payment Date:</strong> ${formattedDate}</li>
                    <li><strong>Status:</strong> <span style="color: #28a745;">Confirmed</span></li>
                </ul>
            </div>

            ${
              nextInstallmentInfo
                ? `
            <div class="next-payment">
                <h4>Next Payment Reminder</h4>
                <p><strong>Next Installment:</strong> ${nextInstallmentInfo.installmentNumber}</p>
                <p><strong>Amount:</strong> ₹${nextInstallmentInfo.amount}</p>
                <p><strong>Due Date:</strong> ${nextInstallmentInfo.dueDate}</p>
            </div>
            `
                : "<p><strong>🎉 All payments completed!</strong> Your application payment is now fully paid.</p>"
            }
            
            <p>Please keep this email as proof of payment. A receipt has been generated and is available in your student portal.</p>
            <p>If you have any questions, please contact our support team.</p>
            
            <p>Best regards,</p>
            <p><strong>${process.env.SMTP_COMPANY}</strong></p>
        </div>
        <div class="footer">
            &copy; 2025 ${process.env.SMTP_COMPANY}. All rights reserved.
        </div>
    </div>
</body>
</html>
`;

export const newUserNonTeachingStaffRegisterEmailWithLoginDetails = (
  name,
  email,
  password,
  date
) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .credentials { background-color: #fff; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Welcome to Non-Teaching Staff - Agnel School of Law</h2>
        </div>
        <div class="content">
          <p>Dear ${name},</p>
          <p>Your non-teaching staff account has been created successfully on ${date}.</p>
          
          <div class="credentials">
            <h3>Login Credentials:</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Password:</strong> ${password}</p>
          </div>
          
          <p>For security reasons, please change your password after first login.</p>
          <p>You can access the portal using these credentials.</p>
          
          <p>Best regards,<br>Administration<br>Agnel School of Law</p>
        </div>
        <div class="footer">
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};