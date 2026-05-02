const IdCardTemplate = (student) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ID Card Template</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        @font-face {
            font-family: 'Rubik';
            font-style: normal;
            font-weight: 400;
            src: url(${student.rubikRegularBase64}) format('truetype');
        }
        @font-face {
            font-family: 'Rubik';
            font-style: normal;
            font-weight: 700;
            src: url(${student.rubikBoldBase64}) format('truetype');
        }
        body {
            font-family: 'Rubik', sans-serif;
            margin: 0;
            padding: 0;
        }
        .id-card-page {
            width: 100vw;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
        }
        #id-card-front-container {
            page-break-after: always;
        }
        .id-card-content {
            width: 100%;
            height: 100%;
            box-sizing: border-box; /* Ensure padding is included in the total dimensions */
            position: relative;
        }
    </style>
</head>
<body class="bg-transparent">
    <div id="id-card-front-container" class="id-card-page">
        <div class="id-card-content bg-white flex flex-col justify-between overflow-hidden">
            <!-- Header -->
            <div class="p-2 flex items-center justify-between">
                <div class="w-16 flex justify-center items-center flex-shrink-0">
                    <img src="${student.agnelLogoBase64}" alt="Logo" class="w-12 h-12">
                </div>
                <div class="text-center flex-grow px-1">
                    <p class="text-[8px] font-semibold">AGNEL CHARITIES</p>
                    <h1 class="text-sm font-bold text-gray-900 leading-tight">AGNEL SCHOOL OF LAW</h1>
                    <div class="text-[6.5px] text-black leading-tight mt-0.5">
                        <p>AGNEL TECHNICAL EDUCATION COMPLEX, SECTOR 9A, VASHI, NAVI MUMBAI, MAHARASHTRA 400703</p>
                        <p>www.agnelschooloflaw.com | +91 2227771000 | asl@agnelschooloflaw.com</p>
                    </div>
                    <div class="text-[6px] font-bold border border-yellow-500 py-0.5 px-1 inline-block">
                        <!-- AY 2025-26 -->
                        ${student.academicYear || ""}
                    </div>
                </div>
                <div class="w-16 flex justify-center items-center flex-shrink-0">
                    <img src="${student.naacLogoBase64}" alt="NAAC Logo" class="w-10 h-10">
                </div>
            </div>
            <!-- Body -->
            <div class="p-2 flex-grow">
                <div class="flex items-center justify-center gap-2 h-full -mt-6">
                    <div class="text-[11px] flex-1">
                        <p class="leading-tight"><span class="font-semibold text-red-600">Name:</span> <span class="uppercase font-semibold">${student.studentDetails.firstName} ${student.studentDetails.middleName} ${student.studentDetails.lastName}</span></p>
                        <p class="leading-tight"><span class="font-semibold text-red-600">Course:</span> <span class="uppercase font-semibold">${student.academicDetails.program}</span></p>
                        <p class="leading-tight"><span class="font-semibold text-red-600">Roll no:</span> <span class="font-semibold">${student.academicDetails.rollNumber}</span></p>
                        <p class="leading-tight"><span class="font-semibold text-red-600">Date of Birth:</span> <span class="uppercase font-semibold">${student.studentDetails.dateOfBirth}</span></p>
                        <p class="leading-tight"><span class="font-semibold text-red-600">Year of Joining:</span> <span class="uppercase font-semibold">${student.academicDetails.yearOfJoining}</span></p>
                    </div>
                    <div class="relative pr-2">
                        <img src="${student.studentPhotoUrl}" alt="Student" class="w-16 h-20 border border-black">
                        <img src="${student.collegeSealBase64}" alt="College Seal" class="absolute -right-1 -bottom-1 w-8 h-8 object-contain" />
                    </div>
                </div>
            </div>
            <!-- Footer -->
            <div class="absolute bottom-0 left-0 right-0 text-[7px] text-center">
                <div class="flex justify-between items-end px-2">
                    <div class="w-1/3 h-5">
                        <img src="${student.studentSignUrl}" alt="Student Signature" class="h-full w-full object-contain" />
                    </div>
                    <div class="w-1/3 h-6">
                        <img src="${student.principalSignBase64}" alt="Principal Signature" class="h-full w-full object-contain" />
                    </div>
                    <div class="w-1/3 h-8">
                        
                    </div>
                </div>
                <div class="bg-yellow-400 p-1 mt-0.5">
                    <div class="flex justify-between">
                        <div class="w-1/3"><p class="font-semibold">Student Signature</p></div>
                        <div class="w-1/3"><p class="font-semibold">Principal</p></div>
                        <div class="w-1/3"><p class="font-semibold">College Seal</p></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <!-- Back of the Card -->
    <div id="id-card-back-container" class="id-card-page">
        <div class="id-card-content bg-white flex flex-col justify-between overflow-hidden">
            <div class="p-3 text-[11px] flex-grow">
                <p class="leading-tight"><span class="font-semibold text-red-600">Blood Group:</span> <span class="font-semibold">${student.studentDetails.bloodGroup || ""}</span></p>
                <p class="leading-tight"><span class="font-semibold text-red-600">Mobile no:</span> <span class="font-semibold">${student.studentDetails.studentMobileNumber}</span></p>
                <p class="leading-tight"><span class="font-semibold text-red-600">Email:</span> <span class="font-semibold">${student.studentDetails.emailAddress}</span></p>
                <p class="leading-tight"><span class="font-semibold text-red-600">Address:</span> <span class="font-semibold">${student.studentDetails.address || ""}</span></p>
                <p class="mt-4 text-[11px]">
                    <span class="font-semibold">If Found Please Return To:</span><br>
                    Agnel School of Law,<br>
                    Sector-9A, Vashi, Navi Mumbai, Maharashtra, India, PIN - 400703
                </p>
            </div>
            <div class="absolute bottom-0 left-0 right-0 bg-yellow-400 p-1 text-center text-black text-[7px] font-semibold">
                This card is the property of Agnel School of Law and must be surrendered upon request
            </div>
        </div>
    </div>
</body>
</html>
`;

export default IdCardTemplate;
