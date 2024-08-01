# Axie Community Treasury Dashboard

This project is a dashboard for visualizing the Axie Community Treasury data. It displays various charts to show the growth and sales of the treasury over different time periods.

## Table of Contents

- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Data Synchronization](#data-synchronization)
- [Tech Documentation](#tech-documentation)
  - [Technologies Used](#technologies-used)
  - [Project Structure](#project-structure)
  - [Components](#components)
  - [Utilities](#utilities)

## Installation

1. Clone the repository:

```sh
git clone https://github.com/emcphersonburke/axie-gov-data.git
cd axie-gov-data
```

2. Install dependencies:

```sh
npm install
```

3. Set up your environment variables (see below).

4. Run the development server:

```sh
npm run dev
```

## Environment Variables

Create a `.env.local` file in the root of your project based on the `.env.local.example` file.

## API Endpoints

### Fetch Transactions

Fetch transactions grouped by different intervals.

**Endpoint:** `/api/fetch-transactions`

**Method:** `GET`

**Parameters:**

- `groupBy` - Interval to group transactions by (`30m`, `8h`, `daily`, `weekly`, `monthly`).

**Example:**

```sh
GET /api/fetch-transactions?groupBy=daily
```

### Data Synchronization

To sync data to Supabase, you need to use the Supabase SQL API or Supabase functions. Here is an example of how you might define views and functions in Supabase.

**Creating Views:**

```sql
-- Daily Aggregated Transactions
CREATE VIEW daily_aggregated_transactions AS
SELECT
  DATE_TRUNC('day', timestamp) AS date,
  type,
  SUM(axs_fee) AS axs_fee,
  SUM(weth_fee) AS weth_fee,
  COALESCE(nft_type, 'No NFT Transfer') AS nft_type
FROM transactions
LEFT JOIN nft_transfers ON nft_transfers.transaction_id = transactions.transaction_id
WHERE type != 'unknown'
GROUP BY 1, 2, 5
ORDER BY 1;
```

**Fetching Cumulative Totals Before a Given Date:**

```sql
-- Function to fetch cumulative totals before a given date
CREATE FUNCTION get_cumulative_totals_before(date TIMESTAMPTZ)
RETURNS TABLE (total_axs NUMERIC, total_weth NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT SUM(axs_fee), SUM(weth_fee)
  FROM transactions
  WHERE timestamp < $1;
END;
$$ LANGUAGE plpgsql;
```

**Calling the Function:**

```sh
SELECT * FROM get_cumulative_totals_before('2024-05-28');
```

## Tech Documentation

### Technologies Used

- **Next.js**: React framework for building server-side rendered and statically generated web applications.
- **Supabase**: Backend-as-a-Service providing a real-time database and authentication.
- **Nivo**: A library for data visualization, used to create the charts in this project.

### Project Structure

```sh
.
├── components
│   ├── BarChart
│   │   └── BarChart.tsx
│   ├── ChartGroup
│   │   └── ChartGroup.tsx
│   ├── LineChart
│   │   └── LineChart.tsx
│   └── PageContent
│       └── PageContent.tsx
├── lib
│   └── nivo.ts
├── pages
│   ├── api
│   │   └── fetch-transactions.ts
│   └── index.tsx
├── public
├── styles
│   ├── globals.css
│   └── Home.module.css
└── types
    └── index.ts
```

### Components

- **BarChart**: Displays sales data broken down by NFT type or transaction type.
- **ChartGroup**: A container for grouping multiple charts and managing time range selection.
- **LineChart**: Displays cumulative totals of AXS and WETH over time.
- **PageContent**: The main content of the page, including headers and ChartGroups.

### Utilities

- **nivo.ts**: Configuration for Nivo charts, including themes and color schemes.

## License

This project is licensed under the MIT License.
