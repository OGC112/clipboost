// Shared JSON response handling for editor and library API requests.
export async function readJsonResponse(response, fallbackMessage='Request failed'){
  const text=await response.text();
  let data={};
  if(text){
    try{data=JSON.parse(text)}catch(_){
      throw new Error(`${fallbackMessage} (server returned an invalid response, HTTP ${response.status})`);
    }
  }
  if(!response.ok)throw new Error(data?.error||`${fallbackMessage} (HTTP ${response.status})`);
  return data;
}
