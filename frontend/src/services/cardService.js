import api from './api';

export const getCards = async () => {
  const response = await api.get('/cards');
  return response.data;
};

export const createCard = async (payload) => {
  const response = await api.post('/cards', payload);
  return response.data;
};

export const deleteCard = async (id) => {
  const response = await api.delete(`/cards/${id}`);
  return response.data;
};
