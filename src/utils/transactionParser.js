const AMOUNT_PATTERN = /(₹|rs\.?|inr|\bINR\b)\s?([\d,]+(?:\.\d{1,2})?)/i;

const normalizeText = (value = '') => String(value).toLowerCase();

const parseAmount = (message = '') => {
  const match = message.match(AMOUNT_PATTERN);

  if (!match) {
    return null;
  }

  const numericText = match[2].replace(/,/g, '');
  const parsed = Number(numericText);

  return Number.isFinite(parsed) ? parsed : null;
};

const parseTransactionMessage = (sms = {}) => {
  if (sms.source === 'manual') {
    const date = new Date(sms.date);
    if (
      (sms.type !== 'expense' && sms.type !== 'income') ||
      !Number.isFinite(sms.amount) ||
      sms.amount <= 0 ||
      Number.isNaN(date.getTime())
    ) {
      return null;
    }
    return { amount: sms.amount, type: sms.type, sender: 'Manual entry', message: sms.note || '', date };
  }

  const text = normalizeText(sms.body || '');

  if (!text) {
    return null;
  }

  let type = null;

  if (
    text.includes('debited') ||
    text.includes('spent') ||
    text.includes('paid') ||
    text.includes('debit') ||
    text.includes('withdraw') ||
    text.includes('purchase')
  ) {
    type = 'expense';
  } else if (
    text.includes('credited') ||
    text.includes('received') ||
    text.includes('credit') ||
    text.includes('refund') ||
    text.includes('reversed')
  ) {
    type = 'income';
  }

  if (!type) {
    return null;
  }

  const amount = parseAmount(sms.body || '');

  if (amount === null) {
    return null;
  }

  const timestamp = Number(sms.date || Date.now());
  if (!Number.isFinite(timestamp)) return null;

  return {
    amount,
    type,
    sender: sms.address || 'Unknown',
    message: sms.body || '',
    date: new Date(timestamp),
  };
};

const formatCurrency = (value = 0) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

const isSameDay = (a, b) => {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
};

const isSameMonth = (a, b) => {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth();
};

const summarizeTransactions = (messages = [], now = new Date()) => {

  const totals = {
    today: { expense: 0, income: 0 },
    thisMonth: { expense: 0, income: 0 },
    all: { expense: 0, income: 0 },
  };

  messages.forEach((sms) => {
    const parsed = parseTransactionMessage(sms);

    if (!parsed) {
      return;
    }

    const itemDate = new Date(parsed.date);

    totals.all[parsed.type] += parsed.amount;

    if (isSameMonth(itemDate, now)) {
      totals.thisMonth[parsed.type] += parsed.amount;
    }

    if (isSameDay(itemDate, now)) {
      totals.today[parsed.type] += parsed.amount;
    }
  });

  return totals;
};

const summarizeByDay = (messages = [], dayCount = 7, now = new Date()) => {
  const days = [];
  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    days.push({
      key,
      label: offset === 0 ? 'Today' : date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
      expense: 0,
      income: 0,
    });
  }

  const totalsByDay = new Map(days.map((day) => [day.key, day]));
  messages.forEach((message) => {
    const parsed = parseTransactionMessage(message);
    if (!parsed) return;
    const day = totalsByDay.get(
      `${parsed.date.getFullYear()}-${String(parsed.date.getMonth() + 1).padStart(2, '0')}-${String(parsed.date.getDate()).padStart(2, '0')}`,
    );
    if (day) day[parsed.type] += parsed.amount;
  });
  return days;
};

const parserApi = {
  parseTransactionMessage,
  summarizeTransactions,
  summarizeByDay,
  formatCurrency,
};

module.exports = parserApi;
