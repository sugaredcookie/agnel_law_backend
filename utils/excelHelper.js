import ExcelJS from "exceljs";

export const createWorkbook = () => {
  return new ExcelJS.Workbook();
};

export const styleHeaderRow = (worksheet) => {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;
};

export const autoSizeColumns = (worksheet) => {
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    column.width = maxLength < 10 ? 10 : maxLength + 2;
  });
};

export const createStandardWorksheet = (workbook, sheetName, headers, data) => {
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.columns = headers.map((header) => ({
    header: header.label || header,
    key: header.key || header.toLowerCase().replace(/\s+/g, "_"),
    width: header.width || 15,
  }));

  styleHeaderRow(worksheet);

  data.forEach((row) => {
    worksheet.addRow(row);
  });

  return worksheet;
};

export const parseExcelFile = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) {
    throw new Error("No worksheet found in the file");
  }

  const rows = [];
  const headers = [];

  worksheet.getRow(1).eachCell((cell) => {
    headers.push(cell.value);
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const rowData = {};
      row.eachCell((cell, colNumber) => {
        rowData[headers[colNumber - 1]] = cell.value;
      });
      rows.push(rowData);
    }
  });

  return { headers, rows };
};

export const sendExcelResponse = async (res, workbook, filename) => {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

  await workbook.xlsx.write(res);
  res.end();
};

export const getNestedValue = (obj, path) => {
  return path.split(".").reduce((current, prop) => current?.[prop], obj);
};

export const formatExcelDate = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString();
};
