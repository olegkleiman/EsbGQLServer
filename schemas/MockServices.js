import casual from 'casual';

const mockServices = [{
    Id: 1,
    CategoryId: 1,
    Name: 'Service Name A',
    Url: casual.url,
    ExpectedSla: 200
  }, {
    Id: 2,
    CategoryId: 2,
    Name: 'Service Name B',
    Url: casual.url,
    ExpectedSla: 150
}, {
  Id: 3,
  CategoryId: 2,
  Name: 'Service Name C',
  Url: casual.url,
  ExpectedSla: 140
}];

module.exports = mockServices;
