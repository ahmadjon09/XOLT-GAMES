
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { useSWRConfig } from 'swr';
import { http } from './http.js';


export function useGet(url, options = {}) {
  return useSWR(
    url || null,
    async (u) => {
      const res = await http.get(u);
      return res.data;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 20000,   
      errorRetryCount: 2,
      ...options,
    }
  );
}


export function useGetMeta(url, options = {}) {
  return useSWR(
    url || null,
    async (u) => {
      const res = await http.get(u);
      return { data: res.data, meta: res.meta };
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 15000,
      errorRetryCount: 2,
      ...options,
    }
  );
}


export function useMutate(url, mutator, options = {}) {
  return useSWRMutation(url, mutator, {
    revalidate: false,
    ...options,
  });
}


export function useInvalidate() {
  const { mutate } = useSWRConfig();
  return (keys) => {
    const list = Array.isArray(keys) ? keys : [keys];
    list.forEach((k) => {
      if (k) mutate(k);
    });
  };
}
