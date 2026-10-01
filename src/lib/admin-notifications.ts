type NewProjectNotification = {
  projectId: string;
  projectName: string;
  sourceType: string;
  brief: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function notifyAdminsOfNewProject(project: NewProjectNotification) {
  const recipients = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.RESEND_FROM_EMAIL;

  if (!recipients.length || !apiKey || !sender) {
    console.warn("Admin email notification skipped: configure ADMIN_EMAILS, RESEND_API_KEY, and RESEND_FROM_EMAIL.");
    return;
  }

  const dashboardUrl = new URL("/admin", process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000").toString();
  const safeName = escapeHtml(project.projectName);
  const safeSource = escapeHtml(project.sourceType);
  const safeBrief = escapeHtml(project.brief || "No brief provided.");
  const safeUrl = escapeHtml(dashboardUrl);
  const message = [
    `A new ${project.sourceType} request is ready for review.`,
    `Project: ${project.projectName}`,
    `Brief: ${project.brief || "No brief provided."}`,
    `Open the admin dashboard: ${dashboardUrl}`,
  ].join("\n\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: recipients,
        subject: `New project request: ${project.projectName}`,
        text: message,
        html: `<h2>New project request</h2><p>A new ${safeSource} request is ready for review.</p><p><strong>Project:</strong> ${safeName}</p><p><strong>Brief:</strong></p><pre style="white-space:pre-wrap;font:inherit">${safeBrief}</pre><p><a href="${safeUrl}">Open the admin dashboard</a></p>`,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`Admin email notification failed with status ${response.status}.`);
    }
  } catch (error) {
    console.error("Admin email notification failed.", error);
  }
}