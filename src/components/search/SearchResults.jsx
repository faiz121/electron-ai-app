import React from 'react';
import SearchResult from './SearchResult';

const SearchResults = ({ results }) => {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        No matching documents found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {results.map((result, index) => (
        <SearchResult 
          key={`${result.path}-${index}`} 
          result={result}
        />
      ))}
    </div>
  );
};

export default SearchResults;