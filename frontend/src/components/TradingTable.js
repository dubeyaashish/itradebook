import React from 'react';

const TradingTable = ({ rows }) => (
  <table className="data-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>Ticket</th>
        <th>Buy Size</th>
        <th>Buy Price</th>
        <th>Sell Size</th>
        <th>Sell Price</th>
        <th>Symbol</th>
        <th>Date</th>
        <th>Type</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r) => (
        <tr key={r.id}>
          <td>{r.id}</td>
          <td>{r.refid}</td>
          <td>{r.buysize}</td>
          <td>{r.buyprice}</td>
          <td>{r.sellsize}</td>
          <td>{r.sellprice}</td>
          <td>{r.symbolref}</td>
          <td>{new Date(r.date).toLocaleString()}</td>
          <td>{r.type}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export default TradingTable;
