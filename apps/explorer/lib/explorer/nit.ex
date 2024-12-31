defmodule Explorer.Nit.ABI do
  @abi """
  [
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "recorder",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "string",
          "name": "assetCid",
          "type": "string"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "commitData",
          "type": "string"
        }
      ],
      "name": "Commit",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "recorder",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "string",
          "name": "assetCid",
          "type": "string"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "integrityData",
          "type": "string"
        },
        {
          "indexed": false,
          "internalType": "bytes",
          "name": "signature",
          "type": "bytes"
        }
      ],
      "name": "Integrity",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "assetCid",
          "type": "string"
        },
        {
          "internalType": "string",
          "name": "commitData",
          "type": "string"
        }
      ],
      "name": "commit",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "blockNumber",
          "type": "uint256"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "assetCid",
          "type": "string"
        }
      ],
      "name": "getCommits",
      "outputs": [
        {
          "internalType": "uint256[]",
          "name": "",
          "type": "uint256[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "assetCid",
          "type": "string"
        }
      ],
      "name": "getRecordLogs",
      "outputs": [
        {
          "internalType": "uint256[]",
          "name": "",
          "type": "uint256[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "initialize",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        },
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "recordLogs",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "assetCid",
          "type": "string"
        },
        {
          "internalType": "string",
          "name": "integrityData",
          "type": "string"
        },
        {
          "internalType": "bytes",
          "name": "signature",
          "type": "bytes"
        }
      ],
      "name": "registerIntegrityRecord",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ]
  """

  def get_abi, do: @abi
end

defmodule Explorer.Nit.Decoder do
  defp prepare_data(data) do
    String.replace_prefix(data, "0x", "") |> Base.decode16!(case: :lower)
  end

  defp safe_decode(function_spec, data) do
    try do
      case ABI.decode(function_spec, data) do
        [nid, commit_data] -> {:ok, [nid, commit_data]}
        _ -> {:error, "Decoding mismatch"}
      end
    rescue
      _ in MatchError -> {:error, "Decoding mismatch"}
    end
  end

  def get_commit(data) do
    function_name = "commit"
    with {:ok, decoded_abi} <- Explorer.Nit.ABI.get_abi() |> Jason.decode(),
         function_spec when not is_nil(function_spec) <- ABI.parse_specification(decoded_abi) |> Enum.find(&(&1.function == function_name)),
         result <- safe_decode(function_spec, prepare_data(data)) do
      result
    else
      {:error, reason} -> {:error, reason}
      nil -> {:error, "Function '" <> function_name <> "' not found"}
    end
  end

  def get_nid(data) do
    case Explorer.Nit.Decoder.get_commit(data) do
      {:ok, [nid, _commit_data]} -> {:ok, nid}
      _error -> {:error, "Failed to extract NID"}
    end
  end
end
