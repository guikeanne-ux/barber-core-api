export function normalizeCreateAppointmentBody(body: Record<string, unknown>): void {
  if (typeof body.customerName === 'string') {
    body.customerName = body.customerName.trim();
  }

  if (typeof body.customerPhone === 'string') {
    const trimmed = body.customerPhone.trim();
    body.customerPhone = trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof body.notes === 'string') {
    const trimmed = body.notes.trim();
    body.notes = trimmed.length > 0 ? trimmed : undefined;
  }
}

export function normalizeCancelAppointmentBody(body: Record<string, unknown>): void {
  if (typeof body.reason === 'string') {
    const trimmed = body.reason.trim();
    body.reason = trimmed.length > 0 ? trimmed : undefined;
  }
}

function parseIntegerish(value: unknown): unknown {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return value;
  }

  return Number.parseInt(value, 10);
}

export function normalizeAppointmentListQuery(input: Record<string, unknown>): void {
  input.page = parseIntegerish(input.page);
  input.pageSize = parseIntegerish(input.pageSize);
}
