import { expect, test } from 'bun:test';
import { orderCustomerName } from '../src/lib/order-customer-label';

test('manual customer order shows Alex Shimmin, never its creator Dane J', () => {
  expect(orderCustomerName({user_id:'creator',customer_type:'manual',shipping_name:'Alex Shimmin'}, {creator:'Dane J'})).toBe('Alex Shimmin');
  expect(orderCustomerName({user_id:'creator',customer_type:'manual'}, {creator:'Dane J'})).toBe('Manual customer');
});

test('explicit site-customer orders keep the selected site customer name', () => {
  expect(orderCustomerName({user_id:'buyer',customer_type:'existing',shipping_name:'Checkout name'}, {buyer:'Colin'})).toBe('Colin');
});