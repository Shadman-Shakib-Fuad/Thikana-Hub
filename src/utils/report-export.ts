import type {
  AnalyticsResponse,
  AnalyticsMetrics,
} from "@/types/analytics";

// =====================================
// REPORT CONFIGURATION
// =====================================

const BRAND = "ThikanaHub";
const TIME_ZONE = "Asia/Dhaka";

const METRICS = [
  { key: "total", label: "Total Addresses" },
  { key: "confirmed", label: "Confirmed" },
  { key: "reviewRequested", label: "Review Requested" },
  { key: "awaitingDecision", label: "Awaiting Decision" },
  { key: "noConfidentMatch", label: "No Confident Match" },
  { key: "saved", label: "Saved Addresses" },
] as const satisfies ReadonlyArray<{
  key: keyof AnalyticsMetrics;
  label: string;
}>;

// =====================================
// COMMON HELPERS
// =====================================

function getFilename(
  data: AnalyticsResponse,
  extension: "pdf" | "csv"
) {
  return `ThikanaHub_Report_${data.range.from}_to_${data.range.to}.${extension}`;
}

function formatDate(date: string) {
  return new Date(
    `${date}T00:00:00.000Z`
  ).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(
    "en-GB",
    {
      timeZone: TIME_ZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("en-GB");
}

function calculateRate(
  confirmed: number,
  total: number
) {
  return total === 0
    ? 0
    : Math.round(
        (confirmed / total) * 1000
      ) / 10;
}

// =====================================
// BROWSER FILE DOWNLOAD
// =====================================

function downloadBlob(
  blob: Blob,
  filename: string
) {
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);

  link.click();

  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30000);
}

// =====================================
// CSV EXPORT
// =====================================

function csvCell(value: string | number) {
  let text = String(value);

  // Spreadsheet formula protection

  if (
    typeof value === "string" &&
    /^[\s]*[=+\-@\t\r\n]/.test(text)
  ) {
    text = "'" + text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export function exportAnalyticsCSV(
  data: AnalyticsResponse
) {
  const headers = [
    "Row Type",
    "Date",
    "Total Addresses",
    "Confirmed",
    "Review Requested",
    "Awaiting Decision",
    "No Confident Match",
    "Saved Addresses",
    "Confirmation Rate (%)",
    "Period Start",
    "Period End",
    "Time Zone",
    "Generated At UTC",
  ];

  const metadata = [
    data.range.from,
    data.range.to,
    data.range.timeZone,
    data.generatedAt,
  ];

  const rows: Array<
    Array<string | number>
  > = [
    headers,

    [
      "Summary",
      "",
      ...METRICS.map(
        (metric) =>
          data.summary[metric.key]
      ),
      data.summary.confirmationRate,
      ...metadata,
    ],

    ...data.daily.map((day) => [
      "Daily",
      day.date,
      ...METRICS.map(
        (metric) => day[metric.key]
      ),
      calculateRate(
        day.confirmed,
        day.total
      ),
      ...metadata,
    ]),
  ];

  const content = rows
    .map((row) =>
      row.map(csvCell).join(",")
    )
    .join("\r\n");

  const blob = new Blob(
    ["\uFEFF", content],
    {
      type: "text/csv;charset=utf-8",
    }
  );

  downloadBlob(
    blob,
    getFilename(data, "csv")
  );
}

// =====================================
// PROFESSIONAL PDF EXPORT
// =====================================

export async function exportAnalyticsPDF(
  data: AnalyticsResponse
) {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const W = 210;
  const H = 297;
  const M = 15;
  const CW = W - M * 2;

  const summary = data.summary;

  doc.setProperties({
    title: "ThikanaHub Merchant Analytics Report",
    subject: "Address resolution statistics",
    author: BRAND,
    creator: BRAND,
  });

  // =================================
  // PDF HEADER
  // =================================

  function header(subtitle: string) {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, W, 29, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(21);

    doc.text(BRAND, M, 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    doc.text(subtitle, M, 20);

    doc.setFillColor(5, 150, 105);
    doc.rect(0, 29, W, 2, "F");
  }

  function sectionTitle(
    title: string,
    y: number
  ) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);

    doc.text(title, M, y);
  }

  // =================================
  // PAGE 01: EXECUTIVE SUMMARY
  // =================================

  header("Secure Address Resolution Engine");

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);

  doc.text(
    "Merchant Analytics Report",
    M,
    43
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);

  doc.text(
    `Period: ${formatDate(data.range.from)} - ${formatDate(data.range.to)}`,
    M,
    50
  );

  doc.text(
    `Generated: ${formatTimestamp(data.generatedAt)} (UTC+6)`,
    M,
    56
  );

  // =================================
  // SUMMARY STATISTICS CARDS
  // =================================

  const gap = 4;
  const cardWidth = (CW - gap) / 2;
  const cardHeight = 22;
  const cardTop = 64;

  const cards = [
    ...METRICS.map((metric) => ({
      label: metric.label,

      value: formatNumber(
        summary[metric.key]
      ),
    })),

    {
      label: "Confirmation Rate",

      value:
        summary.total === 0
          ? "N/A"
          : `${summary.confirmationRate}%`,
    },

    {
      label: "Reporting Days",
      value: String(data.range.days),
    },
  ];

  cards.forEach((card, index) => {
    const column = index % 2;

    const row = Math.floor(index / 2);

    const x =
      M + column * (cardWidth + gap);

    const y =
      cardTop +
      row * (cardHeight + gap);

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(226, 232, 240);

    doc.roundedRect(
      x,
      y,
      cardWidth,
      cardHeight,
      2,
      2,
      "FD"
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);

    doc.text(
      card.label,
      x + 5,
      y + 7
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(4, 120, 87);

    doc.text(
      card.value,
      x + 5,
      y + 17
    );
  });

  // =================================
  // DAILY ACTIVITY BAR CHART
  // =================================

  sectionTitle(
    "Daily Address Activity",
    177
  );

  const chartX = M + 10;
  const chartY = 187;
  const chartW = CW - 10;
  const chartH = 37;

  const maxValue = Math.max(
    1,
    ...data.daily.map(
      (day) => day.total
    )
  );

  // Chart grid lines

  for (let i = 0; i <= 4; i++) {
    const y =
      chartY +
      chartH -
      (i / 4) * chartH;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);

    doc.line(
      chartX,
      y,
      chartX + chartW,
      y
    );
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);

  doc.text(
    String(maxValue),
    chartX - 2,
    chartY + 1,
    { align: "right" }
  );

  doc.text(
    "0",
    chartX - 2,
    chartY + chartH,
    { align: "right" }
  );

  const step =
    chartW /
    Math.max(1, data.daily.length);

  const barWidth =
    Math.min(step * 0.7, 12);

  data.daily.forEach((day, index) => {
    const height =
      (day.total / maxValue) *
      chartH;

    const x =
      chartX +
      index * step +
      (step - barWidth) / 2;

    if (height > 0) {
      doc.setFillColor(5, 150, 105);

      doc.rect(
        x,
        chartY + chartH - height,
        barWidth,
        height,
        "F"
      );
    }

    const labelInterval = Math.max(
      1,
      Math.ceil(data.daily.length / 6)
    );

    if (index % labelInterval === 0) {
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);

      doc.text(
        day.date.slice(5),
        x + barWidth / 2,
        chartY + chartH + 5,
        { align: "center" }
      );
    }
  });

  // =================================
  // STATUS DISTRIBUTION
  // =================================

  sectionTitle(
    "Address Status Distribution",
    244
  );

  const segments = [
    {
      label: "Confirmed",
      value: summary.confirmed,

      color: [5, 150, 105] as const,
    },

    {
      label: "Review",
      value: summary.reviewRequested,

      color: [217, 119, 6] as const,
    },

    {
      label: "Pending",
      value: summary.awaitingDecision,

      color: [148, 163, 184] as const,
    },
  ];

  doc.setFillColor(226, 232, 240);

  doc.rect(
    M,
    250,
    CW,
    6,
    "F"
  );

  let segmentX = M;

  segments.forEach((segment) => {
    const width =
      summary.total === 0
        ? 0
        : (
            segment.value /
            summary.total
          ) * CW;

    if (width > 0) {

      // FIXED: Explicit RGB arguments

      doc.setFillColor(
        segment.color[0],
        segment.color[1],
        segment.color[2]
      );

      doc.rect(
        segmentX,
        250,
        width,
        6,
        "F"
      );

      segmentX += width;
    }
  });

  segments.forEach((segment, index) => {
    const x =
      M + index * (CW / 3);

    // FIXED: Explicit RGB arguments

    doc.setFillColor(
      segment.color[0],
      segment.color[1],
      segment.color[2]
    );

    doc.rect(
      x,
      261,
      3,
      3,
      "F"
    );

    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);

    doc.text(
      `${segment.label}: ${segment.value}`,
      x + 5,
      263.5
    );
  });

  // =================================
  // DAILY STATISTICS TABLE
  // =================================

  const columns = [
    { label: "Date", width: 30 },
    { label: "Total", width: 20 },
    { label: "Confirmed", width: 23 },
    { label: "Review", width: 21 },
    { label: "Pending", width: 21 },
    { label: "No Match", width: 23 },
    { label: "Saved", width: 20 },
    { label: "Rate", width: 22 },
  ];

  const rowHeight = 7;

  let rowY = 0;

  function tableHeader() {
    doc.setFillColor(15, 23, 42);

    doc.rect(
      M,
      rowY,
      CW,
      9,
      "F"
    );

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);

    let x = M;

    columns.forEach((column) => {
      doc.text(
        column.label,
        x + 2,
        rowY + 6
      );

      x += column.width;
    });

    rowY += 9;
  }

  function startTablePage(
    continued = false
  ) {
    doc.addPage();

    header(
      "Merchant Analytics - Daily Statistics"
    );

    sectionTitle(
      continued
        ? "Daily Activity Report (Continued)"
        : "Daily Activity Report",

      43
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);

    doc.text(
      `${data.range.from} to ${data.range.to}`,
      M,
      50
    );

    rowY = 56;

    tableHeader();
  }

  startTablePage();

  data.daily.forEach((day, index) => {

    // Automatic page break

    if (rowY + rowHeight > 266) {
      startTablePage(true);
    }

    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);

      doc.rect(
        M,
        rowY,
        CW,
        rowHeight,
        "F"
      );
    }

    const values = [
      day.date,
      String(day.total),
      String(day.confirmed),
      String(day.reviewRequested),
      String(day.awaitingDecision),
      String(day.noConfidentMatch),
      String(day.saved),

      day.total === 0
        ? "N/A"
        : `${calculateRate(day.confirmed, day.total)}%`,
    ];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);

    let x = M;

    values.forEach((value, columnIndex) => {
      doc.text(
        value,
        x + 2,
        rowY + 4.8
      );

      x += columns[columnIndex].width;
    });

    rowY += rowHeight;
  });

  // =================================
  // REPORT NOTES
  // =================================

  const notes =
    "Statistics include existing requests grouped by original creation date. " +
    "Deleted records are excluded. " +
    "Saved addresses are a separate bookmark metric. " +
    "No Confident Match is a subset of Awaiting Decision. " +
    "Confirmation rate is not independently verified address accuracy. " +
    "N/A indicates that no requests exist for the rate calculation.";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  const noteLines: string[] =
    doc.splitTextToSize(notes, CW);

  const notesHeight =
    noteLines.length * 4 + 20;

  // Avoid overlapping notes and footer

  if (rowY + notesHeight > 270) {
    doc.addPage();

    header(
      "Merchant Analytics - Report Notes"
    );

    rowY = 43;
  } else {
    rowY += 9;
  }

  sectionTitle(
    "Report Notes",
    rowY
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  doc.text(
    noteLines,
    M,
    rowY + 6
  );

  // =================================
  // PAGE FOOTERS & PAGE NUMBERS
  // =================================

  const pageCount =
    doc.getNumberOfPages();

  for (
    let page = 1;
    page <= pageCount;
    page++
  ) {
    doc.setPage(page);

    doc.setDrawColor(203, 213, 225);

    doc.line(
      M,
      H - 17,
      W - M,
      H - 17
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);

    doc.text(
      "ThikanaHub | Confidential Merchant Report",
      M,
      H - 10
    );

    doc.text(
      `Page ${page} of ${pageCount}`,
      W - M,
      H - 10,
      { align: "right" }
    );
  }

  // =================================
  // DOWNLOAD GENERATED PDF
  // =================================

  const blob = doc.output("blob");

  downloadBlob(
    blob,
    getFilename(data, "pdf")
  );
}