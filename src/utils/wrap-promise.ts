type Status = 'pending' | 'success' | 'error';

export default function wrapPromise<TResult = any>(promise: Promise<TResult>) {
  let status: Status = 'pending';
  let result: TResult;

  const suspender = promise.then(
    r => {
      status = 'success';
      result = r;
    },
    e => {
      status = 'error';
      result = e;
    }
  );

  return {
    read() {
      if (status === 'pending') {
        throw suspender;
      } else if (status === 'error') {
        throw result;
      } else if (status === 'success') {
        return result;
      }
    },
  };
}
