// literalTarget.js — TargetProvider for a literal IP address (doc 03 §3, §1.1).
// Slice-1: the descriptor already carries the concrete host; nothing to resolve. Later providers
// (gua-own, dynamic-dns-to-self, dns-rebind) do real runtime resolution + DNS orchestration here.
export const literalTarget = {
  id() {
    return "literal";
  },
  async resolve(d) {
    return { host: d.target.host, port: d.target.port, literalForm: d.target.literalForm };
  },
};
